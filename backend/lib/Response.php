<?php
class Response {
    public static function json($data, int $status = 200): void {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success($data = null, string $message = 'OK', int $status = 200): void {
        self::json(['success' => true, 'message' => $message, 'data' => $data], $status);
    }

    public static function created($data): void {
        self::success($data, 'Created', 201);
    }

    public static function error(string $message, int $status = 400, array $extra = []): void {
        self::json(array_merge(['success' => false, 'error' => $message], $extra), $status);
    }

    public static function notFound(string $message = 'Not found'): void {
        self::error($message, 404);
    }

    public static function unauthorized(): void {
        self::error('Unauthorized', 401);
    }

    public static function paginated(array $items, int $total, int $page = 1, int $perPage = 50): void {
        self::json([
            'success'  => true,
            'data'     => $items,
            'meta'     => ['total' => $total, 'page' => $page, 'per_page' => $perPage]
        ]);
    }
}
