export function parseSiemj2Events(actualEventsString: string): string[] {
  const correlatorMarkerIndex = actualEventsString.indexOf('[FromCorrelator]');
  let eventPayloads: string[];

  if (correlatorMarkerIndex >= 0) {
    const correlationResult = actualEventsString.slice(correlatorMarkerIndex);
    const enricherMarker = /^\[FromEnricher\]\s*/gm;
    const markerMatches = [...correlationResult.matchAll(enricherMarker)];

    eventPayloads = markerMatches.map((match) => {
      const payloadStart = match.index + match[0].length;
      const remainingResult = correlationResult.slice(payloadStart);
      const nextStageOffset = remainingResult.search(/^\[From[A-Za-z]+\]/m);
      return nextStageOffset >= 0
        ? remainingResult.slice(0, nextStageOffset)
        : remainingResult;
    });
  } else {
    // evt-tests *_events.txt files contain plain JSON/JSONL without pipeline stage markers.
    eventPayloads = [actualEventsString];
  }

  return eventPayloads.flatMap(extractJsonObjects);
}

function extractJsonObjects(text: string): string[] {
  const events: string[] = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (objectStart < 0) {
      if (character === '{') {
        objectStart = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth++;
    } else if (character === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(objectStart, index + 1);
        try {
          events.push(JSON.stringify(JSON.parse(candidate)));
        } catch {
          // Detailed reports may contain non-JSON brace blocks before an event.
        }
        objectStart = -1;
      }
    }
  }

  return events;
}
