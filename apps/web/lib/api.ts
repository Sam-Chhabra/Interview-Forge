/**
 * Typed API client for the FastAPI backend.
 *
 * Token is held in a module-level variable + mirrored to localStorage so the
 * session survives a page reload. AuthContext is the canonical writer (via
 * setAccessToken); everything else just reads via the api.* methods.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
  const res = await fetch(`${API_URL}${path}`, {
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
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      // No Content-Type — browser sets it with boundary
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
    benchmarks: () => request<any>('/rag/benchmarks'),
    runBenchmarks: () =>
      request<any>('/rag/benchmarks/run', { method: 'POST' }),
    searchCompare: (data: {
      query: string;
      resume_id?: string;
      resume_text?: string;
      chunk_strategy?: string;
      top_k?: number;
    }) =>
      request<any>('/rag/search-compare', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    analyzeFit: (data: {
      resume_id?: string;
      jd_id?: string;
      resume_text?: string;
      jd_text?: string;
      strategy?: string;
      chunk_strategy?: string;
    }) =>
      request<any>('/rag/analyze-fit', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    verifyGrounding: (data: {
      resume_id?: string;
      resume_text?: string;
      anchor: string;
      question: string;
      rationale?: string;
    }) =>
      request<any>('/rag/verify-grounding', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
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
