<?php
// Lista oficial e pré-determinada de Municípios e UF do Brasil (IBGE) para validação

function getBrazilLocations(): array {
    static $locations = null;
    if ($locations === null) {
        $file = __DIR__ . '/../assets/data/locations.json';
        if (file_exists($file)) {
            $locations = json_decode(file_get_contents($file), true) ?: [];
        } else {
            $locations = ['São Paulo, SP', 'Rio de Janeiro, RJ', 'Belo Horizonte, MG', 'Curitiba, PR', 'Brasília, DF', 'Salvador, BA'];
        }
    }
    return $locations;
}

function isValidBrazilLocation(string $location): bool {
    static $locationMap = null;
    if ($locationMap === null) {
        $list = getBrazilLocations();
        $locationMap = array_fill_keys($list, true);
    }
    return isset($locationMap[trim($location)]);
}
