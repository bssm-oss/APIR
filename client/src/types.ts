export interface ScanOptions {
  skipPhases?: string[];
  quick?: boolean;
}

export type ApiConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface ApiEndpoint {
  path: string;
  method: string;
  source: string;
  sources?: string[];
  confidence: ApiConfidence;
  foundIn?: string | string[];
  evidence?: unknown;
  sampleRequest?: string;
  note?: string;
  endpoint?: string;
  url?: string;
}

export type Api = ApiEndpoint;
export type BuriedApi = ApiEndpoint;

export interface ScanResponse {
  target: string;
  scanTime: string;
  surfaceApis: ApiEndpoint[];
  buriedApis: ApiEndpoint[];
  schemaInference: Record<string, unknown>;
  jwtAnalysis: unknown[];
  corsReport: unknown[];
  serverFingerprint: unknown;
  riskScore: number;
  metadata?: {
    phaseTimings?: Record<string, number>;
    skippedPhases?: string[];
    concurrency?: number;
    utilityErrors?: string[];
  };
}

export interface NormalizedApi extends ApiEndpoint {
  id: string;
  path: string;
  method: string;
  source: string;
  confidence: ApiConfidence;
  category: 'surface' | 'buried';
}
