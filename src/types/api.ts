// Shared API envelope types used by every service response.

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: string;
  statusCode?: number;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Standard shape for paginated list endpoints.
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Query params shared by list endpoints.
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// Typed error thrown from the API client.
export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}
