<?php
/**
 * Adobe PDF Services API client
 * Docs: https://developer.adobe.com/document-services/docs/apis/
 */
class AdobeApiClient {
    private string $clientId;
    private string $clientSecret;
    private ?string $accessToken  = null;
    private int    $tokenExpiry   = 0;
    private const  MAX_POLL       = 30;   // max polling attempts
    private const  POLL_INTERVAL  = 2;    // seconds between polls

    public function __construct(string $clientId, string $clientSecret) {
        $this->clientId     = $clientId;
        $this->clientSecret = $clientSecret;
    }

    // ── Auth ──────────────────────────────────────────────────────────────────

    private function getAccessToken(): string {
        if ($this->accessToken && time() < $this->tokenExpiry - 60) {
            return $this->accessToken;
        }

        $ch = curl_init(ADOBE_TOKEN_URL);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query([
                'client_id'     => $this->clientId,
                'client_secret' => $this->clientSecret,
            ]),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $raw      = curl_exec($ch);
        $curlErr  = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false) {
            throw new RuntimeException('Adobe auth: network error — ' . $curlErr);
        }

        $res = json_decode($raw, true) ?? [];

        if ($httpCode >= 400) {
            $detail = $res['error_description'] ?? $res['error'] ?? $res['message'] ?? $raw;
            throw new RuntimeException("Adobe auth failed (HTTP {$httpCode}): {$detail}");
        }

        if (empty($res['access_token'])) {
            throw new RuntimeException('Adobe auth: unexpected response — ' . substr($raw, 0, 300));
        }

        $this->accessToken = $res['access_token'];
        $this->tokenExpiry = time() + ($res['expires_in'] ?? 86399);
        return $this->accessToken;
    }

    private function authHeaders(): array {
        return [
            'Authorization: Bearer ' . $this->getAccessToken(),
            'X-API-Key: ' . $this->clientId,
            'Content-Type: application/json',
        ];
    }

    // ── Asset Upload ──────────────────────────────────────────────────────────

    /**
     * Upload a PDF to Adobe asset storage.
     * Returns the assetID for use in operations.
     */
    public function uploadAsset(string $filePath): string {
        // Step 1: request upload URI
        $res = $this->curlPost(ADOBE_API_BASE . '/assets', json_encode([
            'mediaType' => 'application/pdf'
        ]), $this->authHeaders());

        if (empty($res['assetID']) || empty($res['uploadUri'])) {
            throw new RuntimeException('Adobe: failed to create asset. ' . json_encode($res));
        }
        $assetId   = $res['assetID'];
        $uploadUri = $res['uploadUri'];

        // Step 2: PUT file content
        $this->curlPut($uploadUri, $filePath);

        return $assetId;
    }

    // ── PDF Properties ────────────────────────────────────────────────────────

    public function getPdfProperties(string $assetId): array {
        $res = $this->curlPost(ADOBE_API_BASE . '/operation/pdfproperties',
            json_encode(['assetID' => $assetId]), $this->authHeaders());

        $jobId = $this->extractJobId($res, 'pdfproperties');
        return $this->pollJob('/operation/pdfproperties/' . $jobId);
    }

    // ── PDF Accessibility Checker ─────────────────────────────────────────────

    public function getAccessibilityResults(string $assetId): array {
        $res = $this->curlPost(ADOBE_API_BASE . '/operation/accessibilitychecker',
            json_encode(['assetID' => $assetId]), $this->authHeaders());

        $jobId = $this->extractJobId($res, 'accessibilitychecker');
        $result = $this->pollJob('/operation/accessibilitychecker/' . $jobId);

        // Download result asset if present
        if (!empty($result['resource']['assetID'])) {
            $reportAsset = $result['resource']['assetID'];
            $reportData  = $this->downloadAsset($reportAsset);
            if ($reportData) {
                $parsed = json_decode($reportData, true);
                if ($parsed) return $parsed;
            }
        }
        return $result;
    }

    // ── Carwash Operations ────────────────────────────────────────────────────

    /**
     * Auto-tag a PDF for accessibility (adds structural tags).
     * Returns the output assetID.
     */
    public function autoTag(string $assetId): string {
        $res = $this->curlPost(ADOBE_API_BASE . '/operation/autotag',
            json_encode([
                'assetID'        => $assetId,
                'addReport'      => false,
                'shiftHeadings'  => false,
            ]),
            $this->authHeaders()
        );
        $jobId  = $this->extractJobId($res, 'autotag');
        $result = $this->pollJob('/operation/autotag/' . $jobId, maxPoll: 60); // AI op — up to 2 min
        return $this->extractOutputAssetId($result, 'autotag');
    }

    /**
     * Compress a PDF to reduce file size.
     * $level: 'LOW' | 'MEDIUM' | 'HIGH'  (default MEDIUM)
     * Returns the output assetID.
     */
    public function compressPdf(string $assetId, string $level = 'MEDIUM'): string {
        $res = $this->curlPost(ADOBE_API_BASE . '/operation/compresspdf',
            json_encode([
                'assetID'          => $assetId,
                'compressionLevel' => strtoupper($level),
            ]),
            $this->authHeaders()
        );
        $jobId  = $this->extractJobId($res, 'compresspdf');
        $result = $this->pollJob('/operation/compresspdf/' . $jobId);
        return $this->extractOutputAssetId($result, 'compresspdf');
    }

    /**
     * Linearize a PDF for Fast Web View.
     * Returns the output assetID.
     */
    public function linearizePdf(string $assetId): string {
        $res = $this->curlPost(ADOBE_API_BASE . '/operation/linearizepdf',
            json_encode(['assetID' => $assetId]),
            $this->authHeaders()
        );
        $jobId  = $this->extractJobId($res, 'linearizepdf');
        $result = $this->pollJob('/operation/linearizepdf/' . $jobId);
        return $this->extractOutputAssetId($result, 'linearizepdf');
    }

    /**
     * Protect a PDF: locks editing while keeping it readable and printable.
     *
     * $options:
     *   owner_password  (string) — generated randomly if omitted
     *   user_password   (string) — if set, required to open the PDF
     *   allow_copy      (bool)   — allow content copy (default true)
     *   allow_print     (string) — 'HIGH_QUALITY'|'LOW_QUALITY'|'NONE' (default HIGH_QUALITY)
     *
     * Returns the output assetID.
     */
    public function protectPdf(string $assetId, array $options = []): string {
        $ownerPassword = $options['owner_password'] ?? bin2hex(random_bytes(12));
        $body = [
            'assetID'     => $assetId,
            'protections' => [
                'ownerPassword' => $ownerPassword,
                'permissions'   => [
                    'print'               => $options['allow_print'] ?? 'HIGH_QUALITY',
                    'copy'                => $options['allow_copy']  ?? true,
                    'edit'                => 'NONE',
                    'annotationsAndForms' => 'NONE',
                ],
            ],
        ];
        if (!empty($options['user_password'])) {
            $body['protections']['userPassword'] = $options['user_password'];
        }

        $res = $this->curlPost(ADOBE_API_BASE . '/operation/protectpdf',
            json_encode($body), $this->authHeaders());
        $jobId  = $this->extractJobId($res, 'protectpdf');
        $result = $this->pollJob('/operation/protectpdf/' . $jobId);
        return $this->extractOutputAssetId($result, 'protectpdf');
    }

    /**
     * Download an APS asset and write the PDF bytes to $destPath.
     * Returns the number of bytes written.
     */
    public function downloadAssetToFile(string $assetId, string $destPath): int {
        $res = $this->curlGet(
            ADOBE_API_BASE . '/assets/' . urlencode($assetId),
            $this->authHeaders()
        );
        if (empty($res['downloadUri'])) {
            throw new RuntimeException("Adobe: no downloadUri for asset {$assetId}");
        }
        $data = $this->curlGetRaw($res['downloadUri']);
        if ($data === '') {
            throw new RuntimeException("Adobe: empty response downloading asset {$assetId}");
        }
        if (file_put_contents($destPath, $data) === false) {
            throw new RuntimeException("Carwash: could not write to {$destPath}");
        }
        return strlen($data);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function extractOutputAssetId(array $result, string $op): string {
        // Transformation ops return output asset in asset.assetID
        if (!empty($result['asset']['assetID']))    return $result['asset']['assetID'];
        // Fallback: accessibility checker uses resource.assetID
        if (!empty($result['resource']['assetID'])) return $result['resource']['assetID'];
        throw new RuntimeException(
            "Adobe {$op}: no output assetID in response. " . json_encode($result)
        );
    }

    private function extractJobId(array $res, string $op): string {
        // jobID can come back directly or in a Location header simulation
        if (!empty($res['jobID'])) return $res['jobID'];
        // Some endpoints return the job URL in headers — parsed as 'location'
        if (!empty($res['_location'])) {
            $parts = explode('/', $res['_location']);
            return end($parts);
        }
        throw new RuntimeException("Adobe {$op}: no jobID in response. " . json_encode($res));
    }

    private function pollJob(string $path, int $maxPoll = self::MAX_POLL): array {
        $headers  = $this->authHeaders();
        $deadline = $maxPoll * self::POLL_INTERVAL;
        for ($i = 0; $i < $maxPoll; $i++) {
            sleep(self::POLL_INTERVAL);
            $res    = $this->curlGet(ADOBE_API_BASE . $path, $headers);
            $status = strtolower($res['status'] ?? '');
            if ($status === 'done' || $status === 'succeeded') return $res;
            if ($status === 'failed' || $status === 'error') {
                $detail = $res['error']['message'] ?? $res['message'] ?? json_encode($res);
                throw new RuntimeException("Adobe job failed: {$detail}");
            }
            // in_progress / queued — keep polling
        }
        throw new RuntimeException("Adobe job timed out after {$deadline}s");
    }

    private function downloadAsset(string $assetId): ?string {
        // Get download URI
        $res = $this->curlGet(ADOBE_API_BASE . '/assets/' . urlencode($assetId), $this->authHeaders());
        if (empty($res['downloadUri'])) return null;
        return $this->curlGetRaw($res['downloadUri']);
    }

    // ── cURL wrappers ─────────────────────────────────────────────────────────

    private function curlPost(string $url, string $body, array $headers, bool $json = true): array {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 60,
            CURLOPT_HEADERFUNCTION => function($ch, $header) use (&$responseHeaders) {
                $responseHeaders[] = $header;
                return strlen($header);
            }
        ]);
        $responseBody = curl_exec($ch);
        $curlErr      = curl_error($ch);
        $httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($responseBody === false) {
            throw new RuntimeException("Adobe API network error: {$curlErr}");
        }

        $data = json_decode($responseBody ?: '', true) ?? [];

        // Inject location header into response for job polling
        foreach (($responseHeaders ?? []) as $h) {
            if (stripos($h, 'location:') === 0) {
                $data['_location'] = trim(substr($h, 9));
            }
        }

        if ($httpCode >= 400) {
            $detail = $data['message'] ?? $data['error_description'] ?? $data['error'] ?? substr($responseBody, 0, 300);
            throw new RuntimeException("Adobe API HTTP {$httpCode}: {$detail}");
        }
        return $data;
    }

    private function curlGet(string $url, array $headers): array {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
        ]);
        $body     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $data = json_decode($body ?: '', true) ?? [];
        if ($httpCode >= 400) {
            throw new RuntimeException("Adobe API HTTP {$httpCode}: " . json_encode($data));
        }
        return $data;
    }

    private function curlGetRaw(string $url): string {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30]);
        $body = curl_exec($ch);
        curl_close($ch);
        return $body ?: '';
    }

    private function curlPut(string $url, string $filePath): void {
        $fh   = fopen($filePath, 'r');
        $size = filesize($filePath);
        $ch   = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_PUT            => true,
            CURLOPT_INFILE         => $fh,
            CURLOPT_INFILESIZE     => $size,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/pdf'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 120,
        ]);
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        fclose($fh);
        if ($code >= 400) {
            throw new RuntimeException("Adobe PUT failed HTTP {$code}: {$res}");
        }
    }
}
