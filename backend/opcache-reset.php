<?php
// One-time OPcache reset — DELETE THIS FILE after use
if (function_exists('opcache_reset')) {
    opcache_reset();
    echo 'OPcache cleared.';
} else {
    echo 'OPcache not active — no action needed.';
}
