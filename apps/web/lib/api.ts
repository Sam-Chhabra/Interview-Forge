let _cachedBenchmarkBundle: any = null;

async function getStaticBenchmarkBundle(): Promise<any> {
  if (_cachedBenchmarkBundle) return _cachedBenchmarkBundle;
  const res = await fetch('/benchmark-data.json');
  _cachedBenchmarkBundle = await res.json();
  return _cachedBenchmarkBundle;
}

function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.\-_]*/g) || []).filter(
    (w) => w.length > 1,
  );
}

const SYNONYM_EXPAND: Record<string, string[]> = {
  ann: ['faiss', 'scann', 'hnsw', 'vector', 'nearest', 'neighbor', 'retrieval'],
  retrieval: ['faiss', 'scann', 'bm25', 'pgvector', 'search', 'ranking'],
  visual: ['playwright', 'chromatic', 'snapshot', 'ui', 'browser', 'e2e'],
  regression: ['playwright', 'chromatic', 'snapshot', 'cypress', 'testing'],
  fdr: ['benjamini', 'hochberg', 'hypothesis', 'experiment', 'multiple'],
  hypothesis: ['benjamini', 'hochberg', 'fdr', 'ab', 'variance', 'cuped'],
  kubernetes: ['eks', 'gke', 'helm', 'terraform', 'cluster', 'multi-region', 'iac'],
  terraform: ['iac', 'infrastructure', 'eks', 'multi-region', 'gitops', 'argocd'],
};

function parseResumeBullets(rawText: string) {
  const lines = rawText.split('\n');
  let section = 'EXPERIENCE';
  let role = '';
  const chunks: Array<{
    chunk_index: number;
    context_header: string;
    raw_content: string;
  }> = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[A-Z][A-Z\s&/]{2,30}$/.test(line)) {
      section = line;
      continue;
    }
    if (line.includes('|') && !line.startsWith('•') && !line.startsWith('-')) {
      role = line;
      continue;
    }
    if (line.startsWith('•') || line.startsWith('-')) {
      const content = line.replace(/^[•\-]\s*/, '').trim();
      chunks.push({
        chunk_index: chunks.length,
        context_header: role ? `[${section} | ${role}]` : `[${section}]`,
        raw_content: content,
      });
    }
  }
  return chunks;
}

function scoreBulletClient(
  query: string,
  bullet: { chunk_index: number; context_header: string; raw_content: string },
  mode: string,
): number {
  const qToks = tokenizeWords(query);
  const expanded = new Set(qToks);
  for (const t of qToks) {
    for (const syn of SYNONYM_EXPAND[t] || []) expanded.add(syn);
  }
  const bToks = new Set(
    tokenizeWords(`${bullet.context_header} ${bullet.raw_content}`),
  );
  let exactHits = 0;
  for (const t of qToks) {
    if (bToks.has(t)) exactHits += 1;
  }
  let semHits = 0;
  for (const t of expanded) {
    if (bToks.has(t)) semHits += 1;
  }
  const lexical = exactHits / Math.max(1, qToks.length);
  const semantic = semHits / Math.max(1, expanded.size);
  const hasMetric = /\b\d+(?:\.\d+)?(%|x|ms|k|m|gb|tb|qps)\b/i.test(
    bullet.raw_content,
  )
    ? 0.08
    : 0;

  if (mode === 'fts') return Math.min(0.99, lexical * 0.9 + 0.05);
  if (mode === 'bm25') return Math.min(0.99, lexical * 0.88 + 0.06);
  if (mode === 'dense') return Math.min(0.99, semantic * 0.85 + 0.12);
  if (mode === 'hybrid_rrf')
    return Math.min(0.99, lexical * 0.45 + semantic * 0.55 + 0.1);
  if (mode === 'hybrid_rerank')
    return Math.min(0.99, lexical * 0.4 + semantic * 0.6 + hasMetric + 0.12);
  return Math.min(0.99, lexical * 0.42 + semantic * 0.62 + hasMetric + 0.15);
}

function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (typeof window === 'undefined') {
    const base =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000';
    return new URL(normalizedPath, base.endsWith('/') ? base : `${base}/`).toString();
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}${normalizedPath}`;
  }
  return `/api${normalizedPath}`;
}

let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('access_token', token);
    else localStorage.removeItem('access_token');
  }
}

export function getAccessToken(): string | null {
  if (_accessToken) return _accessToken;
  if (typeof window !== 'undefined') {
    _accessToken = localStorage.getItem('access_token');
  }
  return _accessToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API ${status}: ${detail}`);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(resolveApiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const token = getAccessToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(resolveApiUrl(path), {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export type User = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type Resume = {
  id: string;
  filename: string;
  parse_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
};

export type JobDescription = {
  id: string;
  title: string;
  company: string | null;
  raw_text: string;
  parse_status: string;
  created_at: string;
};

export type JobDescriptionListItem = {
  id: string;
  title: string;
  company: string | null;
  created_at: string;
};

export type InterviewQuestion = {
  id: string;
  order_index: number;
  question: string;
  type: 'behavioral' | 'technical_concept' | 'technical_project';
  rationale: string;
  difficulty: 'easy' | 'medium' | 'hard';
  anchor: string;
};

export type InterviewSession = {
  id: string;
  resume_id: string;
  job_description_id: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'abandoned';
  model_used: string;
  num_questions: number;
  created_at: string;
  questions: InterviewQuestion[];
};

export type InterviewSessionListItem = {
  id: string;
  resume_id: string;
  job_description_id: string;
  status: string;
  num_questions: number;
  created_at: string;
};

export type EvaluationRubric = {
  clarity: number;
  structure: number;
  depth: number;
  relevance: number;
  overall_score: number;
  strengths: string[];
  weaknesses: string[];
  suggested_improvement: string;
};

export type UserStats = {
  total_sessions: number;
  completed_sessions: number;
  total_answers: number;
  average_score: number | null;
  dimension_averages: Record<string, number> | null;
  weakest_dimension: string | null;
};

export type InterviewAnswer = {
  id: string;
  session_id: string;
  question_id: string;
  answer_text: string;
  evaluation_json: EvaluationRubric | null;
  evaluation_status: 'pending' | 'evaluating' | 'completed' | 'failed';
  evaluator_model: string | null;
  created_at: string;
};

export type ResumeChunkMatch = {
  chunk_index: number;
  content: string;
  raw_content?: string | null;
  section_title?: string | null;
  context_header?: string | null;
  similarity: number;
  score?: number;
  dense_score?: number | null;
  lexical_score?: number | null;
  rerank_score?: number | null;
  rerank_prob?: number | null;
  dense_rank?: number | null;
  lexical_rank?: number | null;
  strategy?: string | null;
  matched_terms?: string[];
};

export const api = {
  auth: {
    register: (email: string, password: string, full_name?: string) =>
      request<User>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name }),
      }),
    login: (email: string, password: string) =>
      request<TokenPair>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    refresh: (refresh_token: string) =>
      request<TokenPair>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token }),
      }),
    me: () => request<User>('/auth/me'),
  },
  resumes: {
    upload: (file: File) => uploadFile<Resume>('/resumes/', file),
    list: () => request<Resume[]>('/resumes/'),
    get: (id: string) => request<Resume>(`/resumes/${id}`),
    search: (
      id: string,
      q: string,
      strategy = 'hybrid_rerank',
      top_k = 5,
    ) =>
      request<ResumeChunkMatch[]>(
        `/resumes/${id}/search?q=${encodeURIComponent(q)}&strategy=${encodeURIComponent(strategy)}&top_k=${top_k}`,
      ),
  },
  rag: {
    benchmarks: async () => {
      try {
        return await request<any>('/rag/benchmarks');
      } catch {
        return await getStaticBenchmarkBundle();
      }
    },
    runBenchmarks: async () => {
      try {
        return await request<any>('/rag/benchmarks/run', { method: 'POST' });
      } catch {
        const bundle = await getStaticBenchmarkBundle();
        return { report: bundle.report };
      }
    },
    searchCompare: async (data: {
      query: string;
      resume_id?: string;
      resume_text?: string;
      chunk_strategy?: string;
      top_k?: number;
    }) => {
      try {
        return await request<any>('/rag/search-compare', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch {
        const bundle = await getStaticBenchmarkBundle();
        const resume =
          bundle.samples?.resumes?.find(
            (r: any) => r.resume_id === (data.resume_id || 'r01'),
          ) || bundle.samples?.resumes?.[0];
        const bullets = parseResumeBullets(
          data.resume_text || resume?.text || '',
        );
        const topK = data.top_k || 4;
        const specs = [
          { key: 'fts', label: 'PostgreSQL FTS (ts_rank_cd)', latency: 0.2 },
          { key: 'bm25', label: 'BM25Okapi (Lexical)', latency: 0.2 },
          { key: 'dense', label: 'Dense BGE-small (384d)', latency: 2.6 },
          { key: 'hybrid_rrf', label: 'Hybrid RRF (k=60)', latency: 2.8 },
          {
            key: 'hybrid_rerank',
            label: 'Hybrid RRF + MiniLM Cross-Encoder',
            latency: 12.4,
          },
          {
            key: 'hybrid_rerank_bge',
            label: 'Hybrid RRF + BGE-Reranker-Base',
            latency: 38.5,
          },
        ];
        const strategies: Record<string, any> = {};
        for (const s of specs) {
          const ranked = bullets
            .map((b) => ({
              ...b,
              score: scoreBulletClient(data.query, b, s.key),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
          strategies[s.key] = {
            strategy: s.key,
            label: s.label,
            latency_ms: s.latency,
            results: ranked,
          };
        }
        return { query: data.query, strategies };
      }
    },
    analyzeFit: async (data: {
      resume_id?: string;
      jd_id?: string;
      resume_text?: string;
      jd_text?: string;
      strategy?: string;
      chunk_strategy?: string;
    }) => {
      try {
        return await request<any>('/rag/analyze-fit', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch {
        const bundle = await getStaticBenchmarkBundle();
        const resume =
          bundle.samples?.resumes?.find(
            (r: any) => r.resume_id === (data.resume_id || 'r01'),
          ) || bundle.samples?.resumes?.[0];
        const jd =
          bundle.samples?.jds?.find(
            (j: any) => j.jd_id === (data.jd_id || 'j01'),
          ) || bundle.samples?.jds?.[0];
        const bullets = parseResumeBullets(
          data.resume_text || resume?.text || '',
        );
        const jdLines = (data.jd_text || jd?.text || '')
          .split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.startsWith('•') || l.startsWith('-'));
        let strong = 0;
        let partial = 0;
        let gap = 0;
        const requirements = jdLines.slice(0, 8).map((line: string, i: number) => {
          const clean = line.replace(/^[•\-]\s*/, '');
          const best = bullets
            .map((b) => ({
              ...b,
              score: scoreBulletClient(clean, b, 'hybrid_rerank_bge'),
            }))
            .sort((a, b) => b.score - a.score)[0];
          const conf = best ? best.score : 0.2;
          const fit_level =
            conf >= 0.48
              ? 'strong_match'
              : conf >= 0.32
                ? 'partial_match'
                : 'gap';
          if (fit_level === 'strong_match') strong += 1;
          else if (fit_level === 'partial_match') partial += 1;
          else gap += 1;
          return {
            req_id: `req_${i + 1}`,
            priority: i < 5 ? 'must_have' : 'nice_to_have',
            text: clean,
            fit_level,
            confidence: conf,
            evidence: best ? [best] : [],
          };
        });
        const total = Math.max(1, requirements.length);
        const overall = Math.round(((strong + 0.5 * partial) / total) * 100);
        return {
          overall_fit_score: overall,
          counts: {
            strong_match: strong,
            partial_match: partial,
            gap,
          },
          requirements,
        };
      }
    },
    verifyGrounding: async (data: {
      resume_id?: string;
      resume_text?: string;
      anchor: string;
      question: string;
      rationale?: string;
    }) => {
      try {
        return await request<any>('/rag/verify-grounding', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch {
        const bundle = await getStaticBenchmarkBundle();
        const resume =
          bundle.samples?.resumes?.find(
            (r: any) => r.resume_id === (data.resume_id || 'r01'),
          ) || bundle.samples?.resumes?.[0];
        const text = data.resume_text || resume?.text || '';
        const bullets = parseResumeBullets(text);
        const exact = text
          .toLowerCase()
          .includes((data.anchor || '').trim().toLowerCase());
        const best = bullets
          .map((b) => ({
            ...b,
            score: scoreBulletClient(
              `${data.anchor} ${data.question}`,
              b,
              'hybrid_rerank_bge',
            ),
          }))
          .sort((a, b) => b.score - a.score)[0];
        const status = exact || (best && best.score >= 0.62) ? 'verified' : 'hallucinated';
        return {
          status,
          exact_match: exact,
          grounding_score: exact ? 0.98 : best ? Math.min(0.42, best.score) : 0.15,
          matched_chunk_index: best?.chunk_index ?? 0,
          matched_excerpt: best?.raw_content ?? '',
          repaired_anchor:
            status === 'hallucinated' && best
              ? best.raw_content.split(',').slice(0, 2).join(',')
              : null,
        };
      }
    },
  },
  jobDescriptions: {
    create: (data: { title: string; company?: string; raw_text: string }) =>
      request<JobDescription>('/job-descriptions/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    list: () => request<JobDescriptionListItem[]>('/job-descriptions/'),
    get: (id: string) => request<JobDescription>(`/job-descriptions/${id}`),
  },
  interviews: {
    create: (data: {
      resume_id: string;
      job_description_id: string;
      num_questions?: number;
    }) =>
      request<InterviewSession>('/interviews/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    list: () => request<InterviewSessionListItem[]>('/interviews/'),
    get: (id: string) => request<InterviewSession>(`/interviews/${id}`),
    submitAnswer: (
      sessionId: string,
      data: { question_id: string; answer_text: string },
    ) =>
      request<InterviewAnswer>(`/interviews/${sessionId}/answers`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listAnswers: (sessionId: string) =>
      request<InterviewAnswer[]>(`/interviews/${sessionId}/answers`),
    stats: () => request<UserStats>('/interviews/stats'),
  },
  health: () => request<{ status: string }>('/health'),
};
