import * as fs from 'fs';
import * as path from 'path';

import { FileSystemHelper } from '../../helpers/fileSystemHelper';
import { TestHelper } from '../../helpers/testHelper';
import { Configuration } from '../../models/configuration';
import { XpException } from '../../models/xpException';
import { SiemjManager } from '../../models/siemj/siemjManager';

export class CorrGraphRunner {
  constructor(private config: Configuration) {}

  public async run(correlationsFullPath: string, rawEventsFilePath: string): Promise<string> {
    return this.execute(correlationsFullPath, rawEventsFilePath, 'correlate');
  }

  public async normalize(correlationsFullPath: string, rawEventsFilePath: string): Promise<string> {
    return this.execute(correlationsFullPath, rawEventsFilePath, 'normalize');
  }

  public async normalizeAndEnrich(
    correlationsFullPath: string,
    rawEventsFilePath: string
  ): Promise<string> {
    return this.execute(correlationsFullPath, rawEventsFilePath, 'normalizeAndEnrich');
  }

  private async execute(
    correlationsFullPath: string,
    rawEventsFilePath: string,
    mode: 'normalize' | 'normalizeAndEnrich' | 'correlate'
  ): Promise<string> {
    if (!fs.existsSync(rawEventsFilePath)) {
      throw new XpException(`Файл сырых событий '${rawEventsFilePath}' не доступен`);
    }

    if (!fs.existsSync(correlationsFullPath)) {
      throw new XpException(`Директория контента '${correlationsFullPath}' не существует`);
    }

    const rootPath = this.config.getRootByPath(correlationsFullPath);

    // В зависимости от типа контента получаем нужную выходную директорию.
    const rootFolder = path.basename(rootPath);
    const outputFolder = this.config.getOutputDirectoryPath(rootFolder);

    if (!fs.existsSync(outputFolder)) {
      await fs.promises.mkdir(outputFolder, { recursive: true });
    }

    const siemjManager = new SiemjManager(this.config);
    const configBuilder = siemjManager.getConfigBuilder(rootPath);
    configBuilder.addNormalizationsGraphBuilding(false);
    configBuilder.addTablesSchemaBuilding();
    configBuilder.addEventsNormalization({ rawEventsFilePath: rawEventsFilePath });

    let resultFilePath: string;
    let resultNotFoundMessage: string;

    switch (mode) {
      case 'normalize':
        resultFilePath = this.config.getNormalizedEventsFilePath(rootFolder);
        resultNotFoundMessage = 'Нормализованные события не получены. [Смотри Output](command:xp.commonCommands.showOutputChannel)';
        break;

      case 'normalizeAndEnrich':
        configBuilder.addTablesDbBuilding();
        configBuilder.addEnrichmentsGraphBuilding();
        configBuilder.addEventsEnrichment();
        resultFilePath = this.config.getEnrichedEventsFilePath(rootFolder);
        resultNotFoundMessage =
          'Нормализованные и обогащенные события не получены. [Смотри Output](command:xp.commonCommands.showOutputChannel)';
        break;

      case 'correlate':
        configBuilder.addTablesDbBuilding();
        configBuilder.addCorrelationsGraphBuilding();
        configBuilder.addEnrichmentsGraphBuilding();
        configBuilder.addEventsEnrichment();
        configBuilder.addCorrelateEnrichedEvents();
        resultFilePath = this.config.getCorrelatedEventsFilePath(rootFolder);
        resultNotFoundMessage =
          'Корреляционные события не получены. [Смотри Output](command:xp.commonCommands.showOutputChannel)';
        break;
    }

    const siemjConfContent = configBuilder.build();

    const randTmpDir = this.config.getRandTmpSubDirectoryPath(rootFolder);
    await fs.promises.mkdir(randTmpDir, { recursive: true });

    // Сохраняем конфигурационный файл для siemj.
    const siemjConfigPath = path.join(randTmpDir, Configuration.SIEMJ_CONFIG_FILENAME);
    await FileSystemHelper.writeContentFile(siemjConfigPath, siemjConfContent);

    // Без удаления базы возникали странные ошибки filler-а, но это не точно.
    const ftpaDbPath = this.config.getFptaDbFilePath(rootFolder);
    if (fs.existsSync(ftpaDbPath)) {
      await fs.promises.unlink(ftpaDbPath);
    }

    const outputFilesToDelete = [
      this.config.getNormalizedEventsFilePath(rootFolder),
      this.config.getEnrichedEventsFilePath(rootFolder),
      this.config.getCorrelatedEventsFilePath(rootFolder)
    ];
    for (const outputFilePath of outputFilesToDelete) {
      if (fs.existsSync(outputFilePath)) {
        await fs.promises.unlink(outputFilePath);
      }
    }

    await siemjManager.executeSiemjConfig(correlationsFullPath, siemjConfContent);

    if (!fs.existsSync(resultFilePath)) {
      throw new XpException(resultNotFoundMessage);
    }

    let resultContent = await FileSystemHelper.readContentFile(resultFilePath);
    if (mode !== 'correlate') {
      resultContent = TestHelper.sortNormalizedEventsJsonl(resultContent);
    }

    await fs.promises.unlink(siemjConfigPath);
    return resultContent;
  }
}
