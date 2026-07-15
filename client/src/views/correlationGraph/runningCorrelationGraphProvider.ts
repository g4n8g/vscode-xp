import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { MustacheFormatter } from '../mustacheFormatter';
import { DialogHelper } from '../../helpers/dialogHelper';
import { Configuration } from '../../models/configuration';
import { FileSystemHelper } from '../../helpers/fileSystemHelper';
import { RegExpHelper } from '../../helpers/regExpHelper';
import { ExceptionHelper } from '../../helpers/exceptionHelper';
import { EventMimeType, TestHelper } from '../../helpers/testHelper';
import { Enveloper } from '../../models/enveloper';
import { Log } from '../../extension';
import { CorrGraphRunner } from './corrGraphRunner';

type CorrelationGraphAction = 'correlate' | 'normalize' | 'normalizeAndEnrich';

export class RunningCorrelationGraphProvider {
  public static viewId = 'RunningEventsOnCorrelationGraphView';

  private static showView = 'KnowledgebaseTree.runningCorrelationGraph';

  private constructor(
    private readonly config: Configuration,
    private readonly _formatter: MustacheFormatter
  ) {}

  public static init(config: Configuration): void {
    // Форма создания корреляции.
    const createCorrelationTemplateFilePath = path.join(
      config.getExtensionPath(),
      'client',
      'templates',
      'FullGraphRun.html'
    );

    const createCorrelationTemplateContent = fs
      .readFileSync(createCorrelationTemplateFilePath)
      .toString();
    const createCorrelationViewProvider = new RunningCorrelationGraphProvider(
      config,
      new MustacheFormatter(createCorrelationTemplateContent)
    );

    config.getContext().subscriptions.push(
      vscode.commands.registerCommand(RunningCorrelationGraphProvider.showView, async () => {
        return createCorrelationViewProvider.showView();
      })
    );
  }

  private showView() {
    if (!this.config.isKbOpened()) {
      DialogHelper.showWarning(
        this.config.getMessage('View.ObjectTree.Message.NeedToOpenKnowledgeBase')
      );
      return;
    }

    // Создать и показать панель.
    this.view = vscode.window.createWebviewPanel(
      RunningCorrelationGraphProvider.viewId,
      this.config.getMessage('View.CorrelateEvents.Title'),
      vscode.ViewColumn.One,
      {
        retainContextWhenHidden: true,
        enableFindWidget: true
      }
    );

    this.view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.config.getExtensionUri()]
    };

    this.view.webview.onDidReceiveMessage(this.receiveMessageFromWebView, this);

    const resourcesUri = this.config.getExtensionUri();
    const extensionBaseUri = this.view.webview.asWebviewUri(resourcesUri);
    try {
      const templateDefaultContent = {
        ExtensionBaseUri: extensionBaseUri,
        Locale: {
          RawEventsLabel: this.config.getMessage('View.CorrelateEvents.RawEventsLabel'),
          ResultLabel: this.config.getMessage('View.CorrelateEvents.ResultLabel'),
          CorrelateEventsButton: this.config.getMessage(
            'View.CorrelateEvents.CorrelateEventsButton'
          ),
          NormalizeEventsButton: this.config.getMessage('View.CorrelateEvents.NormalizeButton'),
          NormalizeAndEnrichEventsButton: this.config.getMessage(
            'View.CorrelateEvents.NormalizeAndEnrichButton'
          ),
          WordWrapCheckBox: this.config.getMessage('View.CorrelateEvents.WordWrapCheckBox'),
          WrapRawEventsInAnEnvelope: this.config.getMessage(
            'View.IntegrationTests.WrapRawEventsInAnEnvelope'
          )
        }
      };

      const htmlContent = this._formatter.format(templateDefaultContent);
      this.view.webview.html = htmlContent;
    } catch (error) {
      DialogHelper.showError('Не удалось отобразить шаблон правила корреляции', error);
    }
  }

  private async receiveMessageFromWebView(message: any) {
    switch (message.command) {
      case 'runFullGraph': {
        const rawEvents = message.rawEvents;

        if (!rawEvents) {
          DialogHelper.showError('Добавьте сырые события и повторите действие');
          return;
        }
        await this.processRawEvents(rawEvents, 'correlate');
        break;
      }
      case 'normalizeEvents': {
        const rawEvents = message.rawEvents;

        if (!rawEvents) {
          DialogHelper.showError('Добавьте сырые события и повторите действие');
          return;
        }
        await this.processRawEvents(rawEvents, 'normalize');
        break;
      }
      case 'normalizeAndEnrichEvents': {
        const rawEvents = message.rawEvents;

        if (!rawEvents) {
          DialogHelper.showError('Добавьте сырые события и повторите действие');
          return;
        }
        await this.processRawEvents(rawEvents, 'normalizeAndEnrich');
        break;
      }
      case 'addEnvelope': {
        const rawEvents = message?.rawEvents as string;
        const mimeType = message?.mimeType as EventMimeType;

        return vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: this.config.getMessage('View.IntegrationTests.Progress.AddingEnvelope')
          },
          async (progress) => {
            try {
              return this.addEnvelope(rawEvents, mimeType);
            } catch (error) {
              ExceptionHelper.show(
                error,
                this.config.getMessage('View.IntegrationTests.Message.DefaultErrorAddingEnvelope')
              );
            }
          }
        );
      }
    }
  }

  private async processRawEvents(
    rawEvents: string,
    action: CorrelationGraphAction
  ): Promise<void> {
    Log.info(`Correlation graph action started: ${action}`);

    // Прогоняем событие по графам для каждой из корневых директорий текущего режима
    const rootPaths = this.config.getContentRoots();
    for (const rootPath of rootPaths) {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          cancellable: true,
          title: this.getProgressTitle(action)
        },
        async (progress, cancellationToken) => {
          try {
            const rootFolder = path.basename(rootPath);

            // Создаем временную директорию.
            const tmpDirectoryPath = this.config.getRandTmpSubDirectoryPath(rootFolder);
            await fs.promises.mkdir(tmpDirectoryPath, { recursive: true });

            // Сохраняет сырые события в конверте на диск.
            const rawEventsFilePath = path.join(
              tmpDirectoryPath,
              RunningCorrelationGraphProvider.RAW_EVENTS_FILENAME
            );
            await FileSystemHelper.writeContentFile(rawEventsFilePath, rawEvents);

            const runner = new CorrGraphRunner(this.config);
            let resultEventsString: string;
            switch (action) {
              case 'normalize':
                progress.report({
                  message: this.config.getMessage('View.CorrelateEvents.Progress.Normalization')
                });
                resultEventsString = await runner.normalize(rootPath, rawEventsFilePath);
                break;

              case 'normalizeAndEnrich':
                progress.report({
                  message: this.config.getMessage(
                    'View.CorrelateEvents.Progress.NormalizationAndEnrichment'
                  )
                });
                resultEventsString = await runner.normalizeAndEnrich(rootPath, rawEventsFilePath);
                break;

              case 'correlate':
                progress.report({
                  message: this.config.getMessage('View.CorrelateEvents.Progress.Correlation')
                });
                resultEventsString = await runner.run(rootPath, rawEventsFilePath);
                break;
            }

            if (!resultEventsString) {
              if (action === 'correlate') {
                DialogHelper.showInfo(
                  `По этим событиям не произошло ни одной сработки корреляции из папки ${rootFolder}.`
                );
              } else {
                DialogHelper.showError(
                  `Не удалось обработать события с использованием графа для директории ${rootFolder}.`
                );
              }
              return;
            }

            let formattedEvents: string;
            if (action === 'correlate') {
              // Извлекаем имена сработавших корреляций.
              const correlationNames = RegExpHelper.getAllStrings(
                resultEventsString,
                /"correlation_name"\s*:\s*"(.*?)"/g
              );
              if (!correlationNames) {
                DialogHelper.showError(
                  `Не удалось коррелировать нормализованные события с использованием графа для директории ${path.basename(rootPath)}.`
                );
                return;
              }

              const cleanedEvents = TestHelper.removeFieldsFromJsonl(
                resultEventsString,
                '_rule',
                'generator.version',
                'siem_id',
                'uuid',
                '_subjects',
                '_objects',
                'subevents',
                'subevents.time'
              );
              formattedEvents = TestHelper.formatTestCodeAndEvents(cleanedEvents);
              DialogHelper.showInfo(
                `Количество сработавших корреляций: ${correlationNames.length}`
              );
            } else {
              formattedEvents = TestHelper.formatTestCodeAndEvents(resultEventsString);
              DialogHelper.showInfo(this.getSuccessMessage(action, rootFolder));
            }

            // Отдаем события во front-end.
            this.view.webview.postMessage({
              command: 'processingResult',
              events: formattedEvents
            });
          } catch (error) {
            const handled = await ExceptionHelper.showToolBackendUnavailableError(
              error,
              this.config
            );
            if (!handled) {
              ExceptionHelper.show(error);
            }
          }
        }
      );
    }
  }

  public async addEnvelope(rawEventsString: string, mimeType: EventMimeType): Promise<void> {
    let envelopedRawEventsString: string;
    try {
      const enveloper = new Enveloper(this.config);
      const envelopedEvents = enveloper.addEnvelope(rawEventsString, mimeType);
      envelopedRawEventsString = envelopedEvents.join(
        RunningCorrelationGraphProvider.TEXTAREA_END_OF_LINE
      );
    } catch (error) {
      ExceptionHelper.show(error, 'Ошибка добавления конверта');
      return;
    }

    this.view.webview.postMessage({
      command: 'updateRawEvents',
      rawEvents: envelopedRawEventsString
    });
  }

  // TODO: вынести в общий класс для всех вьюшек.
  public static TEXTAREA_END_OF_LINE = '\n';
  public static RAW_EVENTS_FILENAME = 'raw_events.json';

  private view: vscode.WebviewPanel;

  private getProgressTitle(action: CorrelationGraphAction): string {
    switch (action) {
      case 'normalize':
        return this.config.getMessage('View.CorrelateEvents.Progress.Normalization');
      case 'normalizeAndEnrich':
        return this.config.getMessage(
          'View.CorrelateEvents.Progress.NormalizationAndEnrichment'
        );
      case 'correlate':
        return this.config.getMessage('View.CorrelateEvents.Title');
    }
  }

  private getSuccessMessage(action: CorrelationGraphAction, rootFolder: string): string {
    switch (action) {
      case 'normalize':
        return this.config.getMessage(
          'View.CorrelateEvents.Message.SuccessfulNormalization',
          rootFolder
        );
      case 'normalizeAndEnrich':
        return this.config.getMessage(
          'View.CorrelateEvents.Message.SuccessfulNormalizationAndEnrichment',
          rootFolder
        );
      case 'correlate':
        return this.config.getMessage('View.CorrelateEvents.Title');
    }
  }
}
