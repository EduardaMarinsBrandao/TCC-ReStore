<?php
// config/upload_security.php
// Validação do conteúdo real de imagens enviadas por upload.

/**
 * Confere se o arquivo enviado é realmente uma imagem JPG, PNG ou WEBP,
 * inspecionando o conteúdo (getimagesize/finfo) e não apenas a extensão
 * do nome informado pelo cliente. Também exige que o tipo detectado seja
 * compatível com a extensão declarada.
 *
 * @param string $tmpPath Caminho temporário do arquivo enviado.
 * @param string $ext     Extensão (minúscula) do nome original.
 * @return bool
 */
function isRealImageUpload($tmpPath, $ext) {
    if (!is_string($tmpPath) || $tmpPath === '' || !is_file($tmpPath)) {
        return false;
    }

    $extToMimes = [
        'jpg'  => ['image/jpeg', 'image/pjpeg'],
        'jpeg' => ['image/jpeg', 'image/pjpeg'],
        'png'  => ['image/png', 'image/x-png'],
        'webp' => ['image/webp']
    ];
    $ext = strtolower((string)$ext);
    if (!isset($extToMimes[$ext])) {
        return false;
    }
    $allowedMimes = $extToMimes[$ext];

    // 1. Tentar inspecionar os bytes da imagem via getimagesize
    $info = @getimagesize($tmpPath);
    if (is_array($info) && !empty($info['mime'])) {
        return in_array($info['mime'], $allowedMimes, true);
    }

    // 2. Fallback via FileInfo (ex: formatos WebP estendidos onde getimagesize pode não estar compilado com suporte)
    if (function_exists('finfo_open')) {
        $finfo = @finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $detected = @finfo_file($finfo, $tmpPath);
            @finfo_close($finfo);
            if (is_string($detected) && in_array($detected, $allowedMimes, true)) {
                return true;
            }
        }
    }

    return false;
}
