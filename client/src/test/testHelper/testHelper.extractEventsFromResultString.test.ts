import * as assert from 'assert';

import { RegExpHelper } from '../../helpers/regExpHelper';
import { parseSiemj2Events } from '../../helpers/siemj2EventsParser';

suite('TestHelper.extractEventsFromResultString', () => {
  test('parses LF-delimited tagged SIEMJ output with multiple events', () => {
    const result = parseSiemj2Events(
      [
        '[FromNormalizer] {"ignored":true}',
        '[FromCorrelator]',
        '[FromEnricher] {"correlation_name":"Rule","value":"first"}',
        '[FromEnricher] {"correlation_name":"Rule","value":"second"}'
      ].join('\n')
    );

    assert.deepStrictEqual(result, [
      '{"correlation_name":"Rule","value":"first"}',
      '{"correlation_name":"Rule","value":"second"}'
    ]);
  });

  test('parses CRLF-delimited tagged SIEMJ output', () => {
    const result = parseSiemj2Events(
      ['[FromCorrelator]', '[FromEnricher] {', '  "correlation_name": "Rule"', '}'].join(
        '\r\n'
      )
    );

    assert.deepStrictEqual(result, ['{"correlation_name":"Rule"}']);
  });

  test('parses plain JSONL from evt-tests events file', () => {
    const result = parseSiemj2Events(
      '{"correlation_name":"Rule","value":1}\n{"correlation_name":"Rule","value":2}\n'
    );

    assert.deepStrictEqual(result, [
      '{"correlation_name":"Rule","value":1}',
      '{"correlation_name":"Rule","value":2}'
    ]);
  });

  test('finds evt-tests actual events file on Windows', () => {
    const eventsFilePath =
      'C:\\Work\\Output\\reports\\tests\\test_conds_3_events.txt';

    assert.ok(RegExpHelper.getEnrichedCorrTestEventsFileNameV2('Rule', 3).test(eventsFilePath));
  });
});
