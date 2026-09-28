export class VoiceParseResult {
  recordType: string | null
  fields: Record<string, unknown>
  confidence: 'high' | 'low'
  transcript: string
  missingFields: string[] | null
}
