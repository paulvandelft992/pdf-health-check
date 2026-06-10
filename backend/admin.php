<?php
// Serve the standalone admin page — no auth here; auth is handled client-side via JS
header('Content-Type: text/html; charset=utf-8');
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HC App — Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --accent: #1473E6;
      --accent-dark: #0d66d0;
      --red: #C9252D;
      --green: #2e7d32;
      --amber: #b45309;
      --gray-50: #f9fafb;
      --gray-100: #f0f2f5;
      --gray-200: #e5e7eb;
      --gray-300: #d1d5db;
      --gray-400: #9ca3af;
      --gray-500: #6b7280;
      --gray-600: #4b5563;
      --gray-700: #374151;
      --gray-900: #111827;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--gray-100);
      color: var(--gray-900);
      min-height: 100vh;
      font-size: 14px;
    }

    /* ── Header ────────────────────────────────────────────── */
    .app-header {
      background: var(--accent);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      height: 52px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .app-header h1 { font-size: 16px; font-weight: 700; }
    .app-header .header-right { display: flex; align-items: center; gap: 12px; font-size: 13px; }

    /* ── Nav tabs ──────────────────────────────────────────── */
    .tab-bar {
      background: #fff;
      border-bottom: 1px solid var(--gray-200);
      display: flex;
      padding: 0 24px;
    }
    .tab-btn {
      background: none;
      border: none;
      border-bottom: 3px solid transparent;
      cursor: pointer;
      font-size: 13.5px;
      font-weight: 500;
      color: var(--gray-600);
      padding: 12px 16px 9px;
      transition: color .15s, border-color .15s;
    }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
    .tab-btn:hover:not(.active) { color: var(--gray-900); }

    /* ── Content ───────────────────────────────────────────── */
    #tabContent { padding: 24px; }

    /* ── Cards ─────────────────────────────────────────────── */
    .card {
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,.1);
      padding: 22px 24px;
      margin-bottom: 18px;
    }
    .card h3 { font-size: 14px; font-weight: 700; margin-bottom: 16px; color: var(--gray-700); }

    /* ── Stat cards ────────────────────────────────────────── */
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 18px; }
    .stat-card { background: #fff; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.1); padding: 18px 20px; }
    .stat-card .stat-label { font-size: 12px; color: var(--gray-500); font-weight: 500; margin-bottom: 6px; }
    .stat-card .stat-value { font-size: 28px; font-weight: 700; color: var(--gray-900); }

    /* ── Tables ────────────────────────────────────────────── */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 9px 12px; font-size: 11.5px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid var(--gray-200); }
    td { padding: 9px 12px; border-bottom: 1px solid var(--gray-100); vertical-align: middle; }
    tr:hover td { background: var(--gray-50); }
    th.cb-col, td.cb-col { width: 32px; padding-left: 8px; padding-right: 4px; }

    /* ── Chips / status ────────────────────────────────────── */
    .chip { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .chip-completed { background: #dcfce7; color: #166534; }
    .chip-processing { background: #fef3c7; color: #92400e; }
    .chip-pending    { background: #f3f4f6; color: var(--gray-600); }
    .chip-failed     { background: #fee2e2; color: #991b1b; }
    .chip-active     { background: #dbeafe; color: #1e40af; }
    .chip-inactive   { background: #f3f4f6; color: var(--gray-500); }

    /* ── Forms ─────────────────────────────────────────────── */
    .form-group { margin-bottom: 14px; }
    .form-group:last-child { margin-bottom: 0; }
    .form-label { display: block; font-size: 12.5px; font-weight: 600; color: var(--gray-700); margin-bottom: 5px; }
    .form-input {
      width: 100%; height: 36px; padding: 0 10px;
      border: 1px solid #ccc; border-radius: 6px;
      font-size: 13.5px; color: var(--gray-900); background: #fff;
      outline: none; transition: border-color .15s;
    }
    .form-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(20,115,230,.12); }
    input[type="number"].form-input { width: 80px; }
    .form-hint { font-size: 11.5px; color: var(--gray-400); margin-top: 4px; }

    /* ── Buttons ───────────────────────────────────────────── */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600;
      cursor: pointer; border: none; transition: background .15s, opacity .15s;
    }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn-primary   { background: var(--accent); color: #fff; }
    .btn-primary:hover:not(:disabled)   { background: var(--accent-dark); }
    .btn-danger    { background: var(--red); color: #fff; }
    .btn-danger:hover:not(:disabled)    { background: #a81e25; }
    .btn-secondary { background: #fff; color: var(--gray-700); border: 1px solid var(--gray-300); }
    .btn-secondary:hover:not(:disabled) { background: var(--gray-50); }
    .btn-ghost     { background: transparent; color: rgba(255,255,255,.85); border: 1px solid rgba(255,255,255,.4); }
    .btn-ghost:hover:not(:disabled)     { background: rgba(255,255,255,.15); }
    .btn-sm { padding: 5px 12px; font-size: 12px; }

    /* ── Auth screens ──────────────────────────────────────── */
    .auth-wrap { max-width: 420px; margin: 80px auto 0; padding: 0 16px; }
    .auth-logo { font-size: 22px; font-weight: 700; color: var(--accent); margin-bottom: 6px; }
    .auth-sub  { font-size: 13px; color: var(--gray-500); margin-bottom: 24px; }

    /* ── Spinner ───────────────────────────────────────────── */
    .spinner { width: 22px; height: 22px; border: 3px solid var(--gray-200); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Toast ─────────────────────────────────────────────── */
    #toast {
      position: fixed; bottom: 24px; right: 24px;
      padding: 11px 18px; border-radius: 8px; font-size: 13.5px; font-weight: 600; color: #fff;
      box-shadow: 0 4px 20px rgba(0,0,0,.25); z-index: 9999;
      opacity: 0; transform: translateY(10px);
      transition: opacity .25s, transform .25s; pointer-events: none;
    }
    #toast.show { opacity: 1; transform: translateY(0); }
    #toast.success { background: var(--green); }
    #toast.error   { background: var(--red); }
    #toast.info    { background: #0277bd; }
    #toast.warning { background: #b45309; }

    /* ── Filter bar ────────────────────────────────────────── */
    .filter-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
    .filter-input { height: 34px; padding: 0 10px; border: 1px solid var(--gray-300); border-radius: 6px; font-size: 13px; width: 220px; outline: none; }
    .filter-input:focus { border-color: var(--accent); }
    select.filter-select { height: 34px; padding: 0 8px; border: 1px solid var(--gray-300); border-radius: 6px; font-size: 13px; outline: none; cursor: pointer; }

    /* ── Sub-tabs ──────────────────────────────────────────── */
    .sub-tabs { display: flex; gap: 4px; margin-bottom: 16px; }
    .sub-tab { background: none; border: 1px solid var(--gray-300); border-radius: 6px; padding: 5px 14px; font-size: 13px; color: var(--gray-600); cursor: pointer; transition: all .15s; font-weight: 500; }
    .sub-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }

    /* ── Scoring table ─────────────────────────────────────── */
    .scoring-section-title { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--gray-400); margin: 18px 0 8px; }
    .scoring-section-title:first-child { margin-top: 0; }
    .scoring-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    .scoring-table th { font-size: 11px; font-weight: 600; color: var(--gray-400); text-transform: uppercase; letter-spacing: .4px; padding: 5px 8px; border-bottom: 1px solid var(--gray-200); text-align: left; }
    .scoring-table th:last-child, .scoring-table td:last-child { text-align: center; width: 40px; }
    .scoring-table th:nth-child(2), .scoring-table td:nth-child(2) { width: 72px; text-align: center; }
    .scoring-table th:nth-child(3), .scoring-table td:nth-child(3) { width: 100px; }
    .scoring-table th:nth-child(4), .scoring-table td:nth-child(4) { width: 100px; }
    .scoring-table td { padding: 5px 8px; font-size: 12.5px; color: var(--gray-700); border-bottom: 1px solid var(--gray-100); }
    .scoring-table tr:last-child td { border-bottom: none; }
    .scoring-table tr.disabled-row td { color: var(--gray-400); }
    .weight-input { width: 58px; height: 28px; padding: 0 6px; text-align: center; border: 1px solid var(--gray-300); border-radius: 6px; font-size: 13px; }
    .weight-input:disabled { background: var(--gray-100); color: var(--gray-400); }
    .polarity-btn { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 5px; border: 1px solid var(--gray-300); background: var(--white); font-size: 11px; cursor: pointer; white-space: nowrap; color: var(--gray-600); transition: all .12s; }
    .polarity-btn.is-true  { border-color: #2e7d32; background: #f0fdf4; color: #2e7d32; }
    .polarity-btn.is-false { border-color: #b45309; background: #fffbeb; color: #b45309; }
    .polarity-btn:disabled { opacity: .45; cursor: default; }
    .score-total-bar { display:flex; align-items:center; gap:10px; padding:10px 0 2px; font-size:13px; color:var(--gray-500); border-top:1px solid var(--gray-200); margin-top:8px; }
    .score-total-bar strong { color:var(--gray-900); }
    /* Category filter tabs */
    .cat-filter-tabs { display:inline-flex; gap:4px; background:var(--gray-100); border-radius:8px; padding:3px; }
    .cat-filter-btn  { padding:4px 11px; border:none; border-radius:6px; background:transparent; cursor:pointer; font-size:12.5px; color:var(--gray-500); transition:all .12s; white-space:nowrap; }
    .cat-filter-btn.active { background:var(--white); color:var(--gray-900); box-shadow:0 1px 3px rgba(0,0,0,.1); font-weight:600; }
    /* Category chips in scoring table */
    .cat-chips { display:flex; gap:4px; flex-wrap:nowrap; }
    .cat-chip   { padding:2px 8px; border-radius:12px; font-size:10.5px; font-weight:500; cursor:pointer; border:1.5px solid #e0e0e0; background:var(--gray-100); color:var(--gray-400); transition:all .15s; white-space:nowrap; line-height:1.6; }
    .cat-chip:hover { filter:brightness(0.95); }
    .cat-chip.security.active     { border-color:#c62828; background:#fff5f5; color:#c62828; }
    .cat-chip.accessibility.active{ border-color:#1565c0; background:#e3f2fd; color:#1565c0; }
    .cat-chip.usability.active    { border-color:#2e7d32; background:#f0fdf4; color:#2e7d32; }
    /* Multi-category bonus pill */
    .multi-cat-pill { display:inline-block; margin-left:5px; padding:1px 5px; border-radius:4px; background:#dbeafe; color:#1d4ed8; font-size:10px; font-weight:700; vertical-align:middle; cursor:default; }

    /* ── Crawler grid ──────────────────────────────────────── */
    .crawler-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

    /* ── Toolbar ───────────────────────────────────────────── */
    .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }

    @media (max-width: 640px) {
      .stat-grid { grid-template-columns: 1fr; }
      .crawler-grid { grid-template-columns: 1fr; }
      .scoring-table th:nth-child(3), .scoring-table td:nth-child(3) { display: none; }
      .scoring-table th:nth-child(4), .scoring-table td:nth-child(4) { display: none; }
      .cat-filter-tabs { flex-wrap: wrap; }
    }

    /* ── 🔴 MATRIX MODE ────────────────────────────────────────── */
    @keyframes mxPulse   { 0%,100%{box-shadow:0 0 4px rgba(0,255,65,.4)} 50%{box-shadow:0 0 16px rgba(0,255,65,.9)} }
    @keyframes mxFlicker { 0%,89%,91%,94%,96%,100%{opacity:1} 90%{opacity:.7} 93%{opacity:.85} 95%{opacity:.75} }
    @keyframes mxScan    { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }

    body.matrix-mode {
      --accent:#00ff41; --accent-dark:#00cc33; --red:#ff0040; --green:#00ff41;
      --gray-50:#001400; --gray-100:#000d00; --gray-200:#002200; --gray-300:#003300;
      --gray-400:#007711; --gray-500:#00aa22; --gray-600:#00cc33; --gray-700:#00ee44; --gray-900:#00ff41;
      background:#000 !important; color:#00ff41 !important;
      font-family:'Courier New',Courier,monospace !important;
    }
    body.matrix-mode * { font-family:'Courier New',Courier,monospace !important; }

    /* Scanline overlay */
    body.matrix-mode::after {
      content:''; position:fixed; inset:0; pointer-events:none; z-index:9990;
      background:repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(0,255,65,.018) 1px,rgba(0,255,65,.018) 2px);
      animation:mxFlicker 9s infinite;
    }
    /* Moving scan line */
    body.matrix-mode::before {
      content:''; position:fixed; left:0; right:0; height:3px; pointer-events:none; z-index:9991;
      background:linear-gradient(transparent,rgba(0,255,65,.08),transparent);
      animation:mxScan 6s linear infinite;
    }

    body.matrix-mode .app-header {
      background:#000 !important; border-bottom:1px solid #00ff41 !important;
      box-shadow:0 0 24px rgba(0,255,65,.2) !important;
    }
    body.matrix-mode .tab-bar  { background:#000 !important; border-bottom-color:#002200 !important; }
    body.matrix-mode .tab-btn  { color:#009933 !important; }
    body.matrix-mode .tab-btn.active { color:#00ff41 !important; border-bottom-color:#00ff41 !important; text-shadow:0 0 8px rgba(0,255,65,.8); }
    body.matrix-mode .tab-btn:hover:not(.active) { color:#00dd55 !important; }

    body.matrix-mode #tabContent { position:relative; z-index:1; }

    body.matrix-mode .card {
      background:#020d02 !important; border:1px solid #002200 !important;
      box-shadow:0 0 12px rgba(0,255,65,.04) !important;
    }
    body.matrix-mode .card h3 {
      color:#00ff41 !important; text-transform:uppercase !important; letter-spacing:2px !important;
    }
    body.matrix-mode .card h3::before { content:'> '; opacity:.5; }

    body.matrix-mode .stat-card { background:#020d02 !important; border:1px solid #002200 !important; }
    body.matrix-mode .stat-card .stat-label { color:#005500 !important; }
    body.matrix-mode .stat-card .stat-value { color:#00ff41 !important; text-shadow:0 0 10px rgba(0,255,65,.6); }

    body.matrix-mode th { color:#007722 !important; border-bottom-color:#002200 !important; text-transform:uppercase !important; letter-spacing:1px !important; }
    body.matrix-mode td { border-bottom-color:#001100 !important; color:#00bb33 !important; }
    body.matrix-mode tr:hover td { background:#001a00 !important; }

    body.matrix-mode .btn-primary   { background:transparent !important; border:1px solid #00ff41 !important; color:#00ff41 !important; text-shadow:0 0 5px rgba(0,255,65,.5); }
    body.matrix-mode .btn-primary:hover:not(:disabled) { background:rgba(0,255,65,.08) !important; box-shadow:0 0 10px rgba(0,255,65,.3); }
    body.matrix-mode .btn-secondary { background:transparent !important; border-color:#003300 !important; color:#00aa22 !important; }
    body.matrix-mode .btn-danger    { background:transparent !important; border:1px solid #ff0040 !important; color:#ff0040 !important; }
    body.matrix-mode .btn-ghost     { border-color:rgba(0,255,65,.4) !important; color:rgba(0,255,65,.8) !important; }

    body.matrix-mode .form-input, body.matrix-mode .filter-input, body.matrix-mode select.filter-select {
      background:#000 !important; border-color:#002200 !important; color:#00ff41 !important; caret-color:#00ff41;
    }
    body.matrix-mode .form-input:focus { border-color:#00ff41 !important; box-shadow:0 0 0 2px rgba(0,255,65,.15) !important; }
    body.matrix-mode .form-label { color:#008822 !important; }
    body.matrix-mode .form-hint  { color:#005500 !important; }

    body.matrix-mode .chip-completed { background:rgba(0,255,65,.12) !important; color:#00ff41 !important; }
    body.matrix-mode .chip-processing{ background:rgba(255,200,0,.12) !important; color:#ffd000 !important; }
    body.matrix-mode .chip-pending   { background:#001400 !important; color:#005500 !important; }
    body.matrix-mode .chip-failed    { background:rgba(255,0,64,.12) !important; color:#ff0040 !important; }
    body.matrix-mode .chip-active    { background:rgba(0,255,65,.12) !important; color:#00ff41 !important; }

    body.matrix-mode .spinner { border-color:#002200 !important; border-top-color:#00ff41 !important; }

    body.matrix-mode #toast.success { background:#002200 !important; border:1px solid #00ff41; color:#00ff41 !important; }
    body.matrix-mode #toast.error   { background:#1a0008 !important; border:1px solid #ff0040; color:#ff0040 !important; }
    body.matrix-mode #toast.info    { background:#00060f !important; border:1px solid #0088ff; color:#0099ff !important; }
    body.matrix-mode #toast.warning { background:#120a00 !important; border:1px solid #ffa500; color:#ffa500 !important; }

    body.matrix-mode .sub-tab        { background:transparent !important; border-color:#002200 !important; color:#005500 !important; }
    body.matrix-mode .sub-tab.active { background:transparent !important; border-color:#00ff41 !important; color:#00ff41 !important; }

    body.matrix-mode .filter-bar .filter-input, body.matrix-mode .filter-bar select { background:#000 !important; color:#00ff41 !important; border-color:#002200 !important; }

    body.matrix-mode .auth-logo { color:#00ff41 !important; text-shadow:0 0 12px rgba(0,255,65,.7); }
    body.matrix-mode .auth-sub  { color:#005500 !important; }

    body.matrix-mode .weight-input  { background:#000 !important; border-color:#002200 !important; color:#00ff41 !important; }
    body.matrix-mode .polarity-btn  { background:#000 !important; border-color:#003300 !important; color:#008822 !important; }
    body.matrix-mode .polarity-btn.is-true  { border-color:#00ff41 !important; background:rgba(0,255,65,.08) !important; color:#00ff41 !important; }
    body.matrix-mode .polarity-btn.is-false { border-color:#ff0040 !important; background:rgba(255,0,64,.08) !important; color:#ff0040 !important; }
    body.matrix-mode .cat-chip { background:#001400 !important; border-color:#002200 !important; color:#004400 !important; }
    body.matrix-mode .cat-chip.active { border-color:#00ff41 !important; background:rgba(0,255,65,.1) !important; color:#00ff41 !important; }
    body.matrix-mode .cat-filter-tabs { background:#001400 !important; }
    body.matrix-mode .cat-filter-btn  { color:#005500 !important; }
    body.matrix-mode .cat-filter-btn.active { background:#002200 !important; color:#00ff41 !important; }
    body.matrix-mode .score-total-bar { border-top-color:#002200 !important; color:#005500 !important; }
    body.matrix-mode .score-total-bar strong { color:#00ff41 !important; }
    body.matrix-mode .multi-cat-pill { background:rgba(0,255,65,.15) !important; color:#00ff41 !important; }

    #matrixCanvas { position:fixed; top:0; left:0; pointer-events:none; z-index:0; opacity:.14; }

    #mxTerminal {
      position:fixed; bottom:70px; right:20px; width:330px; max-height:185px; overflow:hidden;
      background:rgba(0,6,0,.92); border:1px solid #00ff41; padding:10px 13px;
      font:11px/1.6 monospace; color:#00ff41; z-index:9997; pointer-events:none;
      box-shadow:0 0 22px rgba(0,255,65,.15); border-radius:3px;
    }
    #mxTerminal .mx-term-title { color:rgba(255,255,255,.5); font-size:10px; letter-spacing:1px; margin-bottom:5px; }
    #mxTerminal .mx-term-line  { opacity:.35; margin:1px 0; transition:opacity .3s; }
    #mxTerminal .mx-term-line:last-child { opacity:1; color:#fff; }
    #mxTerminal .mx-term-line:nth-last-child(2) { opacity:.65; }
    #mxTerminal .mx-term-line:nth-last-child(3) { opacity:.45; }

    #mxClock { font-family:monospace; font-size:11px; color:#00aa22; letter-spacing:1px; margin-right:6px; }
    #mxExitBtn { border:1px solid #0088ff !important; color:#0088ff !important; background:transparent !important; font-family:monospace !important; animation:mxPulse 2s infinite; }
    #mxExitBtn:hover { background:rgba(0,136,255,.1) !important; }
  </style>
</head>
<body>
<div id="app"></div>
<div id="toast"></div>

<script>
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE     = window.location.pathname.replace(/\/[^/]*$/, '').replace(/\/$/, '');
const LS_KEY   = 'hcapp_admin_apikey';
const LS_TOK   = 'hcapp_admin_token';
const LS_EMAIL = 'hcapp_admin_email';

// ── Scoring config defaults (mirrors PHP getScoringConfig defaults) ────────────
const SCORING_DEFAULTS = {
  category_multi_bonus: 0.0,
  properties: [
    // Core structure
    { key: 'is_tagged',              label: 'Tagged PDF',                   weight: 12, good_when: true,  enabled: true,  categories: ['accessibility','usability'] },
    { key: 'pdf_version',            label: 'Modern PDF version (≥1.7)',    weight: 8,  good_when: true,  enabled: true,  categories: ['usability','security'],      note: 'Graduated: 1.4=50%, 1.5=65%, 1.6=80%, 1.7+=100%' },
    { key: 'is_linearized',          label: 'Linearized (fast web view)',   weight: 4,  good_when: true,  enabled: true,  categories: ['usability'] },
    { key: 'has_pages',              label: 'Has pages',                    weight: 3,  good_when: true,  enabled: true,  categories: ['usability'] },
    { key: 'native_content',         label: 'Native (non-scanned) content', weight: 2,  good_when: true,  enabled: true,  categories: ['accessibility','usability'] },
    { key: 'has_acroform',           label: 'Has AcroForm',                 weight: 0,  good_when: false, enabled: false, categories: ['usability'] },
    // Security / permissions
    { key: 'is_encrypted',           label: 'Encrypted',                    weight: 5,  good_when: false, enabled: true,  categories: ['security'] },
    { key: 'has_xfa',                label: 'Has XFA forms',                weight: 5,  good_when: false, enabled: true,  categories: ['security','usability'] },
    { key: 'has_embedded_files',     label: 'Has embedded files',           weight: 2,  good_when: false, enabled: true,  categories: ['security','usability'] },
    { key: 'is_certified',           label: 'Certified PDF',                weight: 0,  good_when: true,  enabled: false, categories: ['security','usability'] },
    { key: 'is_signed',              label: 'Digitally signed',             weight: 0,  good_when: true,  enabled: false, categories: ['security'] },
    { key: 'permissions_allow_copy',     label: 'Content copy allowed',             weight: 3,  good_when: true,  enabled: true,  categories: ['security','usability'] },
    { key: 'perm_assistive_tech',        label: 'Assistive technology allowed',     weight: 3,  good_when: true,  enabled: true,  categories: ['accessibility'] },
    { key: 'perm_form_filling',          label: 'Form filling allowed',             weight: 2,  good_when: true,  enabled: false, categories: ['usability'] },
    { key: 'perm_page_extraction',       label: 'Page extraction allowed',          weight: 1,  good_when: true,  enabled: false, categories: ['security'] },
    { key: 'perm_doc_assembly',          label: 'Document assembly restricted',     weight: 1,  good_when: false, enabled: false, categories: ['security'] },
    { key: 'perm_commenting',            label: 'Commenting allowed',               weight: 1,  good_when: true,  enabled: false, categories: ['usability'] },
    { key: 'perm_printing',              label: 'Printing allowed',                 weight: 2,  good_when: true,  enabled: true,  categories: ['usability'] },
    { key: 'perm_editing',               label: 'Editing restricted',               weight: 1,  good_when: false, enabled: false, categories: ['security'] },
    { key: 'pii_author',                 label: 'Author field is personal name (PII)', weight: 4, good_when: false, enabled: true,  categories: ['security'] },
    // Compliance standards
    { key: 'pdfua_compliance',       label: 'PDF/UA compliance',            weight: 8,  good_when: true,  enabled: true,  categories: ['accessibility','usability'] },
    { key: 'pdfa_compliance',        label: 'PDF/A compliance',             weight: 3,  good_when: true,  enabled: false, categories: ['usability'] },
    { key: 'pdfe_compliance',        label: 'PDF/E compliance',             weight: 0,  good_when: true,  enabled: false, categories: ['usability'] },
    { key: 'pdfvt_compliance',       label: 'PDF/VT compliance',            weight: 0,  good_when: true,  enabled: false, categories: ['usability'] },
    { key: 'pdfx_compliance',        label: 'PDF/X compliance',             weight: 0,  good_when: true,  enabled: false, categories: ['usability'] },
    // Metadata completeness
    { key: 'info_title',             label: 'Has document title',           weight: 3,  good_when: true,  enabled: true,  categories: ['usability','accessibility'] },
    { key: 'info_subject',           label: 'Has document subject',         weight: 2,  good_when: true,  enabled: true,  categories: ['usability'] },
    { key: 'info_keywords',          label: 'Has keywords',                 weight: 2,  good_when: true,  enabled: true,  categories: ['usability'] },
    { key: 'has_author',             label: 'Has document author',          weight: 2,  good_when: true,  enabled: true,  categories: ['usability'] },
    { key: 'has_creation_date',      label: 'Has creation date',            weight: 1,  good_when: true,  enabled: true,  categories: ['usability'] },
  ],
  accessibility: [
    { key: 'overall_rate',         label: 'Overall pass rate',   weight: 40, enabled: true,  categories: ['accessibility'] },
    { key: 'check_tagged',         label: 'Tagged PDF check',    weight: 6,  enabled: true,  categories: ['accessibility'] },
    { key: 'check_language',       label: 'Language specified',  weight: 4,  enabled: true,  categories: ['accessibility'] },
    { key: 'check_title',          label: 'Document title',      weight: 3,  enabled: true,  categories: ['accessibility'] },
    { key: 'check_alt_text',       label: 'Alt text / figures',  weight: 4,  enabled: true,  categories: ['accessibility'] },
    { key: 'check_reading_order',  label: 'Reading order',       weight: 3,  enabled: true,  categories: ['accessibility'] },
    { key: 'check_bookmarks',      label: 'Bookmarks',           weight: 2,  enabled: true,  categories: ['accessibility','usability'] },
    { key: 'check_color_contrast', label: 'Color contrast',      weight: 2,  enabled: true,  categories: ['accessibility'] },
    { key: 'check_form_labels',    label: 'Form labels',         weight: 2,  enabled: true,  categories: ['accessibility','usability'] },
  ],
};

const CAT_LABELS = { security: '🔒 Security', accessibility: '♿ Accessibility', usability: '⚙ Usability' };
const ALL_CATS   = ['security', 'accessibility', 'usability'];

// Merge saved config over defaults (saved values win, new default keys survive)
function mergeScoringConfig(saved) {
  const cfg = { properties: [], accessibility: [], category_multi_bonus: SCORING_DEFAULTS.category_multi_bonus };
  if (saved?.category_multi_bonus != null) cfg.category_multi_bonus = parseFloat(saved.category_multi_bonus) || 0;
  ['properties', 'accessibility'].forEach(section => {
    cfg[section] = SCORING_DEFAULTS[section].map(def => {
      const s = (saved?.[section] || {})[def.key];
      return s ? { ...def, ...s, categories: s.categories ?? def.categories } : { ...def };
    });
  });
  return cfg;
}

// Read current values from the DOM back into a config object
function readScoringConfig() {
  const cfg = {
    properties: {},
    accessibility: {},
    category_multi_bonus: parseFloat(document.getElementById('catMultiBonus')?.value) || 0,
  };
  [...SCORING_DEFAULTS.properties, ...SCORING_DEFAULTS.accessibility].forEach(def => {
    const section = SCORING_DEFAULTS.properties.includes(def) ? 'properties' : 'accessibility';
    const row = document.querySelector(`[data-score-key="${def.key}"][data-score-section="${section}"]`);
    if (!row) return;
    const w    = parseInt(row.querySelector('.weight-input')?.value) || 0;
    const enab = row.querySelector('.score-enabled')?.checked ?? false;
    // Read categories from active chip buttons
    const cats = [];
    row.querySelectorAll('.cat-chip.active').forEach(btn => cats.push(btn.dataset.cat));
    const entry = { weight: w, enabled: enab, categories: cats };
    if (section === 'properties') entry.good_when = row.dataset.goodWhen === 'true';
    cfg[section][def.key] = entry;
  });
  return cfg;
}

// Filter scoring table rows by the active category tab
function applyScoringFilter(c) {
  const activeBtn = c.querySelector('.cat-filter-btn.active');
  const filter = activeBtn?.dataset.filter || 'all';
  c.querySelectorAll('.scoring-table tbody tr').forEach(row => {
    if (filter === 'all') { row.style.display = ''; return; }
    const assignedCats = [];
    row.querySelectorAll('.cat-chip.active').forEach(btn => assignedCats.push(btn.dataset.cat));
    row.style.display = assignedCats.includes(filter) ? '' : 'none';
  });
}

function updateScoreTotal() {
  // Sum ALL rows (including hidden filter rows) — only skip disabled ones
  const bonus = parseFloat(document.getElementById('catMultiBonus')?.value) || 0;
  let total = 0;
  document.querySelectorAll('.scoring-table tbody tr').forEach(row => {
    if (!row.querySelector('.score-enabled')?.checked) return;
    const w    = parseInt(row.querySelector('.weight-input')?.value) || 0;
    const nCat = row.querySelectorAll('.cat-chip.active').length;
    const eff  = w * (1 + Math.max(0, nCat - 1) * bonus);
    total += eff;
  });
  const el = document.getElementById('scoreTotal');
  if (el) el.textContent = Math.round(total);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(s) {
  if (!s || s === '1970-01-01 00:00:00') return '—';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

let _toastTimer = null;
function toast(msg, type = 'info', ms = 3500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, ms);
}

function apiFetch(method, path, body) {
  const headers = {
    'X-API-Key':     localStorage.getItem(LS_KEY) || '',
    'X-Admin-Token': localStorage.getItem(LS_TOK) || '',
  };
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
    .then(res => res.json().catch(() => ({})).then(d => ({ ok: res.ok, status: res.status, data: d.data, error: d.error || d.message || ('HTTP ' + res.status) })));
}

const app = document.getElementById('app');
let _activeTab = 'activity';

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  app.innerHTML = '<div style="padding:80px;text-align:center"><div class="spinner"></div></div>';
  let state = { setup_required: false, authenticated: false, email: null };
  try {
    const r = await apiFetch('GET', '/api/auth/verify');
    if (r.ok && r.data) state = r.data;
  } catch {}

  if (state.setup_required) return renderSetup();
  if (state.authenticated)  { localStorage.setItem(LS_EMAIL, state.email || ''); return renderMain(); }
  renderLogin();
}

// ── Setup ─────────────────────────────────────────────────────────────────────
function renderSetup() {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo">HC App Admin</div>
      <div class="auth-sub">Create the first admin account to get started.</div>
      <div class="card">
        <h3>Create Admin Account</h3>
        <div class="form-group">
          <label class="form-label">Email <span style="color:var(--red)">*</span></label>
          <input id="suEmail" class="form-input" type="email" value="pvandelft@adobe.com" autocomplete="username">
        </div>
        <div class="form-group">
          <label class="form-label">Password <span style="color:var(--red)">*</span></label>
          <input id="suPw1" class="form-input" type="password" placeholder="Min. 8 characters" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label class="form-label">Confirm Password <span style="color:var(--red)">*</span></label>
          <input id="suPw2" class="form-input" type="password" placeholder="Repeat password" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label class="form-label">API Key <span style="font-weight:400;color:var(--gray-400)">(optional)</span></label>
          <input id="suApiKey" class="form-input" type="password" placeholder="Leave blank if not configured" autocomplete="off">
        </div>
        <button class="btn btn-primary" id="suBtn" style="width:100%;justify-content:center;margin-top:6px">Create Account</button>
      </div>
    </div>`;

  document.getElementById('suBtn').onclick = async () => {
    const email  = document.getElementById('suEmail').value.trim();
    const pw1    = document.getElementById('suPw1').value;
    const pw2    = document.getElementById('suPw2').value;
    const apiKey = document.getElementById('suApiKey').value.trim();
    if (!email)        { toast('Email is required', 'warning'); return; }
    if (pw1.length < 8){ toast('Password must be at least 8 characters', 'warning'); return; }
    if (pw1 !== pw2)   { toast('Passwords do not match', 'warning'); return; }

    if (apiKey) localStorage.setItem(LS_KEY, apiKey); else localStorage.removeItem(LS_KEY);

    const btn = document.getElementById('suBtn');
    btn.disabled = true; btn.textContent = 'Creating…';

    const r = await apiFetch('POST', '/api/auth/setup', { email, password: pw1 });
    if (!r.ok) { toast(r.error, 'error'); btn.disabled = false; btn.textContent = 'Create Account'; return; }

    localStorage.setItem(LS_TOK, r.data.token);
    localStorage.setItem(LS_EMAIL, r.data.email || email);
    toast('Account created!', 'success');
    renderMain();
  };
  document.getElementById('suPw2').onkeydown = e => { if (e.key === 'Enter') document.getElementById('suBtn').click(); };
}

// ── Login ─────────────────────────────────────────────────────────────────────
function renderLogin() {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo">HC App Admin</div>
      <div class="auth-sub">Sign in to manage your application.</div>
      <div class="card">
        <h3>Sign In</h3>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input id="lgEmail" class="form-input" type="email" placeholder="admin@example.com" autocomplete="username">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input id="lgPw" class="form-input" type="password" placeholder="Enter password" autocomplete="current-password">
        </div>
        <div class="form-group">
          <label class="form-label">API Key <span style="font-weight:400;color:var(--gray-400)">(optional)</span></label>
          <input id="lgApiKey" class="form-input" type="password" placeholder="Leave blank if not configured" value="${esc(localStorage.getItem(LS_KEY) || '')}" autocomplete="off">
          <div class="form-hint">Leave blank if API key is not configured on the backend.</div>
        </div>
        <button class="btn btn-primary" id="lgBtn" style="width:100%;justify-content:center;margin-top:6px">Sign In</button>
      </div>
    </div>`;

  const doLogin = async () => {
    const email  = document.getElementById('lgEmail').value.trim();
    const pw     = document.getElementById('lgPw').value;
    const apiKey = document.getElementById('lgApiKey').value.trim();
    if (!email || !pw) return;

    if (apiKey) localStorage.setItem(LS_KEY, apiKey); else localStorage.removeItem(LS_KEY);

    const btn = document.getElementById('lgBtn');
    btn.disabled = true; btn.textContent = 'Signing in…';

    const r = await apiFetch('POST', '/api/auth/login', { email, password: pw });
    if (!r.ok) { toast(r.error, 'error'); btn.disabled = false; btn.textContent = 'Sign In'; return; }

    localStorage.setItem(LS_TOK, r.data.token);
    localStorage.setItem(LS_EMAIL, r.data.email || email);
    toast('Signed in.', 'success');
    renderMain();
  };

  document.getElementById('lgBtn').onclick  = doLogin;
  document.getElementById('lgPw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
}

// ── Main Panel ────────────────────────────────────────────────────────────────
function renderMain() {
  const email = localStorage.getItem(LS_EMAIL) || '';
  app.innerHTML = `
    <div class="app-header">
      <h1>HC App Admin</h1>
      <div class="header-right">
        <span>Logged in as: <strong>${esc(email)}</strong></span>
        <button class="btn btn-ghost btn-sm" id="logoutBtn">Logout</button>
      </div>
    </div>
    <div class="tab-bar">
      <button class="tab-btn${_activeTab==='activity'?' active':''}"   data-tab="activity">&#128202; Activity</button>
      <button class="tab-btn${_activeTab==='settings'?' active':''}"   data-tab="settings">&#9881;&#65039; Settings</button>
      <button class="tab-btn${_activeTab==='users'?' active':''}"      data-tab="users">&#128101; Admin Users</button>
      <button class="tab-btn${_activeTab==='bulk'?' active':''}"       data-tab="bulk">&#128465; Bulk Management</button>
    </div>
    <div id="tabContent"></div>`;

  document.getElementById('logoutBtn').onclick = doLogout;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _activeTab));
      loadTab(_activeTab);
    });
  });

  loadTab(_activeTab);
  window._matrixPostRender?.();
  if (window._matrixActive) setTimeout(() => window._matrixWireClicks?.(), 100);
}

async function loadTab(tab) {
  const c = document.getElementById('tabContent');
  c.innerHTML = '<div style="padding:40px;text-align:center"><div class="spinner"></div></div>';
  if (tab === 'activity') await renderActivity(c);
  else if (tab === 'settings') await renderSettings(c);
  else if (tab === 'users') await renderUsers(c);
  else if (tab === 'bulk') renderBulk(c);
}

async function doLogout() {
  await apiFetch('POST', '/api/auth/logout').catch(() => {});
  ['hcapp_admin_apikey','hcapp_admin_token','hcapp_admin_email'].forEach(k => localStorage.removeItem(k));
  toast('Signed out.', 'info');
  boot();
}

// ── Activity Tab ──────────────────────────────────────────────────────────────
async function renderActivity(c) {
  const r = await apiFetch('GET', '/api/admin/activity');
  if (!r.ok) { c.innerHTML = `<div class="card" style="color:var(--red)">${esc(r.error)}</div>`; return; }
  const rows = r.data || [];

  const totalCustomers = rows.reduce((s, x) => s + (+x.customers || 0), 0);
  const totalHCs       = rows.reduce((s, x) => s + (+x.health_checks || 0), 0);
  const totalPdfs      = rows.reduce((s, x) => s + (+x.pdfs || 0), 0);

  c.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Total Users</div><div class="stat-value">${rows.length}</div></div>
      <div class="stat-card"><div class="stat-label">Total Health Checks</div><div class="stat-value">${totalHCs}</div></div>
      <div class="stat-card"><div class="stat-label">Total PDFs Analysed</div><div class="stat-value">${totalPdfs}</div></div>
    </div>
    <div class="card">
      <h3>User Activity</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Email</th><th>Customers</th><th>Health Checks</th><th>PDFs</th><th>Last Activity</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(row => `
              <tr>
                <td>${esc(row.email)}</td>
                <td>${esc(row.customers)}</td>
                <td>${esc(row.health_checks)}</td>
                <td>${esc(row.pdfs)}</td>
                <td style="color:var(--gray-500)">${formatDate(row.last_activity)}</td>
              </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:24px">No activity data yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
async function renderSettings(c) {
  const r = await apiFetch('GET', '/api/settings');
  if (!r.ok) { c.innerHTML = `<div class="card" style="color:var(--red)">${esc(r.error)}</div>`; return; }
  const s   = r.data || {};
  const cfg = mergeScoringConfig(s.scoring_config);
  const secretSet    = s.adobe_client_secret && s.adobe_client_secret !== '';
  const yukonTokenSet = s.yukon_token && s.yukon_token !== '';

  // Render category chips for a row
  function catCbs(item) {
    const assigned = item.categories || [];
    const defs = [
      { cat: 'security',      label: 'Security',      icon: '🔒' },
      { cat: 'accessibility', label: 'Accessible',     icon: '♿' },
      { cat: 'usability',     label: 'Usability',      icon: '⚙' },
    ];
    return `<div class="cat-chips">${defs.map(({ cat, label, icon }) => {
      const active = assigned.includes(cat);
      return `<button type="button" class="cat-chip ${cat}${active ? ' active' : ''}" data-cat="${cat}" title="${CAT_LABELS[cat]}">${icon} ${label}</button>`;
    }).join('')}</div>`;
  }

  // Build a combined row for properties (with polarity) or accessibility checks
  function scoreRow(item, section) {
    const dis   = !item.enabled;
    const isAcc = section === 'accessibility';
    const gwCls = item.good_when ? 'is-true' : 'is-false';
    const gwLbl = item.good_when ? '✓ TRUE' : '✓ FALSE';
    const note  = item.note ? `<br><span style="font-size:10px;color:var(--gray-400)">${esc(item.note)}</span>` : '';
    const nCats = (item.categories || []).length;
    const multiPill = nCats > 1 ? `<span class="multi-cat-pill" title="Covers ${nCats} categories — eligible for multi-category bonus">${nCats}×</span>` : '';
    return `<tr data-score-key="${esc(item.key)}" data-score-section="${section}" data-good-when="${item.good_when ?? true}" class="${dis ? 'disabled-row' : ''}">
      <td>${esc(item.label)}${note}${multiPill}</td>
      <td><input class="weight-input" type="number" min="0" max="999" value="${item.weight}"${dis ? ' disabled' : ''}></td>
      <td>${isAcc
        ? '<span style="color:var(--gray-300);font-size:11px">pass/fail</span>'
        : `<button type="button" class="polarity-btn ${gwCls}"${dis ? ' disabled' : ''}>${gwLbl}</button>`
      }</td>
      <td class="cat-cells">${catCbs(item)}</td>
      <td><input type="checkbox" class="score-enabled" ${item.enabled ? 'checked' : ''}></td>
    </tr>`;
  }

  function allRows(items, section) {
    return items.map(p => scoreRow(p, section)).join('');
  }

  c.innerHTML = `
    <div class="card">
      <h3>Adobe PDF Services</h3>
      <div class="form-group">
        <label class="form-label">Client ID</label>
        <input id="adobeId" class="form-input" value="${esc(s.adobe_client_id || '')}" placeholder="Adobe client ID">
      </div>
      <div class="form-group">
        <label class="form-label">Client Secret</label>
        <input id="adobeSecret" class="form-input" type="password" placeholder="${secretSet ? 'Leave blank to keep current' : 'Adobe client secret'}">
        ${secretSet ? '<div class="form-hint" style="color:var(--accent)">Currently set — enter a new value to replace it.</div>' : ''}
      </div>
    </div>

    <div class="card">
      <h3>Scoring Configuration</h3>

      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <span style="font-size:13px;color:var(--gray-400)">Filter by category:</span>
        <div class="cat-filter-tabs">
          <button class="cat-filter-btn active" data-filter="all">All</button>
          <button class="cat-filter-btn" data-filter="security">🔒 Security</button>
          <button class="cat-filter-btn" data-filter="accessibility">♿ Accessibility</button>
          <button class="cat-filter-btn" data-filter="usability">⚙ Usability</button>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px;font-size:13px">
          <label for="catMultiBonus" style="color:var(--gray-400)">Multi-category bonus:</label>
          <input id="catMultiBonus" type="number" min="0" max="2" step="0.1"
            value="${cfg.category_multi_bonus || 0}"
            style="width:70px" class="form-input" title="Each extra category multiplies the effective weight by this bonus factor">
          <span style="color:var(--gray-400);font-size:11px">× per extra category</span>
        </div>
      </div>

      <div class="scoring-section-title">PDF Properties</div>
      <table class="scoring-table">
        <thead><tr>
          <th>Property</th>
          <th>Weight</th>
          <th>Good result</th>
          <th>Categories</th>
          <th>On</th>
        </tr></thead>
        <tbody id="propTbody">${allRows(cfg.properties, 'properties')}</tbody>
      </table>

      <div class="scoring-section-title" style="margin-top:20px">Accessibility Checks</div>
      <table class="scoring-table">
        <thead><tr>
          <th>Check</th>
          <th>Weight</th>
          <th>Good result</th>
          <th>Categories</th>
          <th>On</th>
        </tr></thead>
        <tbody id="accTbody">${allRows(cfg.accessibility, 'accessibility')}</tbody>
      </table>

      <div class="score-total-bar">
        Effective total weight: <strong id="scoreTotal">0</strong>
        <span style="font-size:11px;color:var(--gray-400)">(backend normalises to 0–100; multi-category bonus applied)</span>
      </div>
    </div>

    <div class="card">
      <h3>Crawler Settings</h3>
      <div class="crawler-grid">
        <div class="form-group" style="margin:0">
          <label class="form-label">Max PDFs <span style="font-weight:400;color:var(--gray-400)">(1–200)</span></label>
          <input id="crawlMaxPdfs" class="form-input" type="number" min="1" max="200" value="${esc(String(s.crawler_max_pdfs || 20))}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Max Depth <span style="font-weight:400;color:var(--gray-400)">(1–10)</span></label>
          <input id="crawlMaxDepth" class="form-input" type="number" min="1" max="10" value="${esc(String(s.crawler_max_depth || 3))}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Timeout (s) <span style="font-weight:400;color:var(--gray-400)">(3–30)</span></label>
          <input id="crawlTimeout" class="form-input" type="number" min="3" max="30" value="${esc(String(s.crawler_timeout || 8))}">
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Adobe Yukon</h3>
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:14px">
        Configure the Yukon collection used to store health check summaries for AI-powered Q&amp;A.
        These credentials are used by the server-side Yukon sync (Recalculate page).
      </p>
      <div class="form-group">
        <label class="form-label">Yukon Base URL</label>
        <input id="yukonBaseUrl" class="form-input" value="${esc(s.yukon_base_url || '')}" placeholder="https://firefly-api.adobe.io">
      </div>
      <div class="form-group">
        <label class="form-label">Bearer Token</label>
        <input id="yukonToken" class="form-input" type="password" placeholder="${yukonTokenSet ? 'Leave blank to keep current' : 'Adobe IMS bearer token'}">
        ${yukonTokenSet ? '<div class="form-hint" style="color:var(--accent)">Currently set — enter a new value to replace it.</div>' : ''}
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Collection ID</label>
        <input id="yukonCollectionId" class="form-input" value="${esc(s.yukon_collection_id || '')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
      </div>
    </div>

    <div class="card">
      <h3>Change Password</h3>
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:14px">Change the password for the currently logged-in account.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div class="form-group" style="margin:0">
          <label class="form-label">New Password</label>
          <input id="newPw1" class="form-input" type="password" placeholder="Min. 8 characters" autocomplete="new-password">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Confirm New Password</label>
          <input id="newPw2" class="form-input" type="password" placeholder="Repeat password" autocomplete="new-password">
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" id="changePwBtn">Change Password</button>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:4px">
      <button class="btn btn-primary" id="saveSettBtn">Save All Settings</button>
    </div>`;

  bindScoringEvents(c);
  updateScoreTotal();

  // Category filter tabs — just hide/show rows, don't rebuild
  c.querySelectorAll('.cat-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      c.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyScoringFilter(c);
      updateScoreTotal();
    });
  });

  // Multi-category bonus → update total
  document.getElementById('catMultiBonus')?.addEventListener('input', updateScoreTotal);

  document.getElementById('saveSettBtn').onclick = saveAllSettings;
  document.getElementById('changePwBtn').onclick = changePassword;
}

// Bind interactive scoring events (called after every table rebuild)
function bindScoringEvents(c) {
  // Weight inputs → update total
  c.querySelectorAll('.scoring-table .weight-input').forEach(el => el.addEventListener('input', updateScoreTotal));

  // Category chip toggles → update pills + total + re-apply filter
  c.querySelectorAll('.cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      updateMultiPills(c);
      applyScoringFilter(c);
      updateScoreTotal();
    });
  });

  // Enable checkbox → toggle disabled state, update total
  c.querySelectorAll('.score-enabled').forEach(cbEl => {
    cbEl.addEventListener('change', () => {
      const row    = cbEl.closest('tr');
      const wInput = row.querySelector('.weight-input');
      const polBtn = row.querySelector('.polarity-btn');
      const enabled = cbEl.checked;
      if (wInput) wInput.disabled = !enabled;
      if (polBtn) polBtn.disabled = !enabled;
      row.classList.toggle('disabled-row', !enabled);
      updateScoreTotal();
    });
  });

  // Polarity toggle
  c.querySelectorAll('.polarity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row  = btn.closest('tr');
      const next = row.dataset.goodWhen !== 'true';
      row.dataset.goodWhen = String(next);
      btn.className  = 'polarity-btn ' + (next ? 'is-true' : 'is-false');
      btn.textContent = next ? '✓ TRUE' : '✓ FALSE';
    });
  });
}

// Refresh the Nx pills after category checkbox changes
function updateMultiPills(c) {
  c.querySelectorAll('.scoring-table tbody tr').forEach(row => {
    const nCat = row.querySelectorAll('.cat-chip.active').length;
    let pill = row.querySelector('.multi-cat-pill');
    if (nCat > 1) {
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 'multi-cat-pill';
        row.querySelector('td:first-child').appendChild(pill);
      }
      pill.textContent = nCat + '×';
      pill.title = `Covers ${nCat} categories — eligible for multi-category bonus`;
    } else if (pill) {
      pill.remove();
    }
  });
}

async function saveAllSettings() {
  const btn = document.getElementById('saveSettBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  const body = {
    adobe_client_id:   document.getElementById('adobeId').value.trim(),
    scoring_config:    readScoringConfig(),
    crawler_max_pdfs:  parseInt(document.getElementById('crawlMaxPdfs').value)  || 20,
    crawler_max_depth: parseInt(document.getElementById('crawlMaxDepth').value) || 3,
    crawler_timeout:   parseInt(document.getElementById('crawlTimeout').value)  || 8,
    yukon_base_url:      (document.getElementById('yukonBaseUrl')?.value      || '').trim(),
    yukon_collection_id: (document.getElementById('yukonCollectionId')?.value || '').trim(),
  };
  const secretVal = document.getElementById('adobeSecret').value;
  if (secretVal && secretVal !== '••••••••') body.adobe_client_secret = secretVal;
  const yukonTokVal = document.getElementById('yukonToken')?.value || '';
  if (yukonTokVal && yukonTokVal !== '••••••••') body.yukon_token = yukonTokVal;

  const r = await apiFetch('POST', '/api/settings', body);
  btn.disabled = false; btn.textContent = 'Save All Settings';

  if (!r.ok) { toast(r.error || 'Save failed', 'error'); return; }
  toast('Settings saved.', 'success');
  document.getElementById('adobeSecret').value = '';

  // Cache Yukon credentials in sessionStorage so the Recalculate tab can use them
  // without requiring the user to re-enter the token there.
  if (body.yukon_base_url)      sessionStorage.setItem('yukon_base_url',      body.yukon_base_url);
  if (body.yukon_collection_id) sessionStorage.setItem('yukon_collection_id', body.yukon_collection_id);
  if (yukonTokVal && yukonTokVal !== '••••••••') {
    sessionStorage.setItem('yukon_token', yukonTokVal);
  }
  if (document.getElementById('yukonToken')) document.getElementById('yukonToken').value = '';
}

async function changePassword() {
  const pw1 = document.getElementById('newPw1').value;
  const pw2 = document.getElementById('newPw2').value;
  if (!pw1)           { toast('Enter a new password', 'warning'); return; }
  if (pw1.length < 8) { toast('Password must be at least 8 characters', 'warning'); return; }
  if (pw1 !== pw2)    { toast('Passwords do not match', 'warning'); return; }

  const email = localStorage.getItem(LS_EMAIL) || '';
  const btn   = document.getElementById('changePwBtn');
  btn.disabled = true; btn.textContent = 'Changing…';

  const r = await apiFetch('POST', '/api/auth/setup', { email, password: pw1, force: true });
  btn.disabled = false; btn.textContent = 'Change Password';
  if (!r.ok) { toast(r.error, 'error'); return; }
  if (r.data?.token) localStorage.setItem(LS_TOK, r.data.token);
  toast('Password changed.', 'success');
  document.getElementById('newPw1').value = '';
  document.getElementById('newPw2').value = '';
}

// ── Admin Users Tab ───────────────────────────────────────────────────────────
async function renderUsers(c) {
  const r = await apiFetch('GET', '/api/admin/users');
  if (!r.ok) { c.innerHTML = `<div class="card" style="color:var(--red)">${esc(r.error)}</div>`; return; }
  const users = r.data || [];
  const me = localStorage.getItem(LS_EMAIL) || '';

  c.innerHTML = `
    <div class="card">
      <h3>Admin Users</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Email</th><th>Created</th><th>Last Login</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${esc(u.email)}${u.email === me ? ' <span style="font-size:11px;color:var(--accent)">(you)</span>' : ''}</td>
                <td style="color:var(--gray-500)">${formatDate(u.created_at)}</td>
                <td style="color:var(--gray-500)">${u.last_login_at ? formatDate(u.last_login_at) : '—'}</td>
                <td><span class="chip ${u.is_active ? 'chip-active' : 'chip-inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>${u.email !== me ? `<button class="btn btn-danger btn-sm" data-remove="${esc(u.email)}">Remove</button>` : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>Add Admin User</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:flex-end">
        <div class="form-group" style="margin:0">
          <label class="form-label">Email</label>
          <input id="addEmail" class="form-input" type="email" placeholder="user@example.com">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Password</label>
          <input id="addPw" class="form-input" type="password" placeholder="Min. 8 characters">
        </div>
        <button class="btn btn-primary" id="addUserBtn">Add User</button>
      </div>
    </div>`;

  c.querySelectorAll('[data-remove]').forEach(btn => {
    btn.onclick = async () => {
      const email = btn.dataset.remove;
      if (!confirm(`Remove admin user "${email}"? This cannot be undone.`)) return;
      const r = await apiFetch('DELETE', '/api/admin/users/' + encodeURIComponent(email));
      if (!r.ok) { toast(r.error, 'error'); return; }
      toast('User removed.', 'success');
      renderUsers(c);
    };
  });

  document.getElementById('addUserBtn').onclick = async () => {
    const email = document.getElementById('addEmail').value.trim();
    const pw    = document.getElementById('addPw').value;
    if (!email) { toast('Email is required', 'warning'); return; }
    if (pw.length < 8) { toast('Password must be at least 8 characters', 'warning'); return; }
    const r = await apiFetch('POST', '/api/admin/users', { email, password: pw });
    if (!r.ok) { toast(r.error, 'error'); return; }
    toast('User added.', 'success');
    renderUsers(c);
  };
}

// ── Bulk Management Tab ───────────────────────────────────────────────────────
function renderBulk(c) {
  let _bulkSub = 'hc';

  c.innerHTML = `
    <div class="sub-tabs">
      <button class="sub-tab active" id="subTabHc">Health Checks</button>
      <button class="sub-tab" id="subTabCust">Customers</button>
      <button class="sub-tab" id="subTabScores">Recalculate Scores</button>
    </div>
    <div id="bulkSubContent"></div>`;

  const sc = document.getElementById('bulkSubContent');

  document.getElementById('subTabHc').onclick = () => {
    _bulkSub = 'hc';
    document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('subTabHc').classList.add('active');
    renderBulkHC(sc);
  };
  document.getElementById('subTabCust').onclick = () => {
    _bulkSub = 'cust';
    document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('subTabCust').classList.add('active');
    renderBulkCustomers(sc);
  };
  document.getElementById('subTabScores').onclick = () => {
    _bulkSub = 'scores';
    document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('subTabScores').classList.add('active');
    renderBulkRecalculate(sc);
  };

  renderBulkHC(sc);
}

function renderBulkRecalculate(c) {
  c.innerHTML = `
    <div class="card" style="max-width:600px">
      <h3>Recalculate Document Scores</h3>
      <p style="color:var(--gray-400);font-size:.9rem;margin:8px 0 20px">
        Re-scores every completed document using the current scoring configuration
        (weights, enabled checks, and polarity settings). This will overwrite all
        existing <code>overall_score</code> values. After recalculation you can
        optionally sync updated summaries to the Yukon collection.
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="recalcBtn">&#9654; Run Recalculation</button>
        <button class="btn btn-secondary" id="yukonSyncBtn">&#9729; Sync to Yukon</button>
      </div>
      <div id="recalcStatus"  style="margin-top:20px"></div>
      <div id="yukonSyncStatus" style="margin-top:12px"></div>
    </div>`;

  // ── Recalculate ──────────────────────────────────────────────────────────
  document.getElementById('recalcBtn').onclick = async () => {
    const btn    = document.getElementById('recalcBtn');
    const status = document.getElementById('recalcStatus');
    btn.disabled = true;
    btn.textContent = 'Running…';
    status.innerHTML = '<div class="spinner" style="display:inline-block;width:20px;height:20px;vertical-align:middle"></div> Recalculating scores…';

    const r = await apiFetch('POST', '/api/admin/recalculate-scores');
    btn.disabled = false;
    btn.textContent = '▶ Run Recalculation';

    if (!r.ok) {
      status.innerHTML = `<div style="color:var(--red);padding:12px 0">&#10008; ${esc(r.error || 'Unknown error')}</div>`;
      return;
    }
    const d = r.data || {};
    const hasErrors = d.errors > 0;
    status.innerHTML = `
      <div style="padding:14px 16px;border-radius:8px;background:${hasErrors ? '#fef9c3' : '#dcfce7'};color:${hasErrors ? '#854d0e' : '#15803d'}">
        <strong>${hasErrors ? '⚠' : '✅'} Recalculation done</strong><br>
        <span style="font-size:.875rem">
          Updated: <strong>${d.updated}</strong> &nbsp;·&nbsp;
          Skipped: <strong>${d.skipped}</strong> &nbsp;·&nbsp;
          Errors: <strong>${d.errors}</strong>
        </span>
      </div>`;

    // Auto-trigger Yukon sync so scores are reflected immediately
    if (d.updated > 0) runYukonSync();
  };

  // ── Yukon Sync ───────────────────────────────────────────────────────────
  document.getElementById('yukonSyncBtn').onclick = runYukonSync;

  async function runYukonSync() {
    const syncBtn    = document.getElementById('yukonSyncBtn');
    const syncStatus = document.getElementById('yukonSyncStatus');

    // Resolve credentials: Settings form inputs → sessionStorage → server (base/collection only)
    let base       = (document.getElementById('yukonBaseUrl')?.value       || '').trim()
                  || sessionStorage.getItem('yukon_base_url') || '';
    let token      = (document.getElementById('yukonToken')?.value         || '').trim();
    if (!token || token === '••••••••') token = sessionStorage.getItem('yukon_token') || '';
    let collection = (document.getElementById('yukonCollectionId')?.value  || '').trim()
                  || sessionStorage.getItem('yukon_collection_id') || '';

    // Base URL and collection can come from server (not sensitive); token cannot
    if (!base || !collection) {
      const sr = await apiFetch('GET', '/api/settings');
      if (sr.ok) {
        base       = base       || sr.data?.yukon_base_url      || '';
        collection = collection || sr.data?.yukon_collection_id || '';
        // Cache what we got
        if (base)       sessionStorage.setItem('yukon_base_url',      base);
        if (collection) sessionStorage.setItem('yukon_collection_id', collection);
      }
    }

    // Token is never returned unmasked from the server — prompt inline if missing
    if (!token) {
      syncStatus.innerHTML = `
        <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:14px 16px">
          <p style="margin:0 0 10px;font-size:.875rem;color:var(--gray-600)">
            Enter your Yukon Bearer Token to proceed. It will be cached for this browser session.
          </p>
          <div style="display:flex;gap:8px">
            <input id="yukonTokenPrompt" type="password" class="form-input" placeholder="Bearer token…" style="flex:1">
            <button class="btn btn-primary btn-sm" id="yukonTokenConfirm">Sync</button>
          </div>
        </div>`;
      document.getElementById('yukonTokenConfirm').onclick = () => {
        const t = document.getElementById('yukonTokenPrompt').value.trim();
        if (!t) return;
        sessionStorage.setItem('yukon_token', t);
        syncStatus.innerHTML = '';
        runYukonSync();
      };
      return;
    }

    if (!base || !collection) {
      syncStatus.innerHTML = `<div style="color:var(--gray-500);font-size:.875rem;padding:8px 0">
        ℹ Yukon Base URL and Collection ID are not configured. Set them in the Settings tab.
      </div>`;
      return;
    }

    syncBtn.disabled = true;
    syncBtn.textContent = '⏳ Syncing…';
    syncStatus.innerHTML = '<div class="spinner" style="display:inline-block;width:16px;height:16px;vertical-align:middle"></div> Generating summaries…';

    // Step 1: ask the server to generate all markdown documents
    const r = await apiFetch('POST', '/api/admin/yukon-sync');
    if (!r.ok) {
      syncBtn.disabled = false;
      syncBtn.textContent = '☁ Sync to Yukon';
      syncStatus.innerHTML = `<div style="color:var(--red);font-size:.875rem;padding:8px 0">✖ ${esc(r.error || 'Failed to generate documents')}</div>`;
      return;
    }

    const docs = r.data?.documents || [];
    if (!docs.length) {
      syncBtn.disabled = false;
      syncBtn.textContent = '☁ Sync to Yukon';
      syncStatus.innerHTML = `<div style="color:var(--gray-400);font-size:.875rem;padding:8px 0">ℹ No completed health checks found to sync.</div>`;
      return;
    }

    // Step 2: upload each document to Yukon directly from the browser
    syncStatus.innerHTML = `<div class="spinner" style="display:inline-block;width:16px;height:16px;vertical-align:middle"></div> Uploading 0 / ${docs.length}…`;

    let synced = 0, errors = 0;
    const errorLog = [];
    const uploadUrl = base.replace(/\/$/, '') + '/api/v2/collection/' + encodeURIComponent(collection) + '/upload?option=FILE_NAME';

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      syncStatus.innerHTML = `<div class="spinner" style="display:inline-block;width:16px;height:16px;vertical-align:middle"></div> Uploading ${i + 1} / ${docs.length}: ${esc(doc.hc_name)}…`;
      try {
        const blob = new Blob([doc.content], { type: 'text/markdown' });
        const form = new FormData();
        form.append('documents', blob, doc.filename);

        const res = await fetch(uploadUrl, {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body:    form,
        });

        if (res.ok) {
          synced++;
        } else {
          errors++;
          if (errorLog.length < 5) {
            const err = await res.json().catch(() => ({}));
            errorLog.push('HC #' + doc.hc_id + ' — HTTP ' + res.status + (err.detail ? ': ' + err.detail : ''));
          }
        }
      } catch (e) {
        errors++;
        if (errorLog.length < 5) errorLog.push('HC #' + doc.hc_id + ' — ' + e.message);
      }
    }

    syncBtn.disabled = false;
    syncBtn.textContent = '☁ Sync to Yukon';

    const hasErrors = errors > 0;
    const errItems  = errorLog.map(e => `<li style="margin:3px 0">${esc(e)}</li>`).join('');
    syncStatus.innerHTML = `
      <div style="padding:12px 16px;border-radius:8px;background:${hasErrors ? '#fef9c3' : '#e0f2fe'};color:${hasErrors ? '#854d0e' : '#0369a1'}">
        <strong>${hasErrors ? '⚠' : '☁'} Yukon sync done</strong><br>
        <span style="font-size:.875rem">
          Synced: <strong>${synced}</strong> &nbsp;·&nbsp;
          Errors: <strong>${errors}</strong>
        </span>
        ${errItems ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:.8rem">${errItems}</ul>` : ''}
      </div>`;
  }
}

async function renderBulkHC(c) {
  c.innerHTML = '<div style="padding:40px;text-align:center"><div class="spinner"></div></div>';
  const r = await apiFetch('GET', '/api/admin/health-checks');
  if (!r.ok) { c.innerHTML = `<div class="card" style="color:var(--red)">${esc(r.error)}</div>`; return; }
  const rows = r.data || [];

  c.innerHTML = `
    <div class="card">
      <h3>Health Checks <span style="font-weight:400;color:var(--gray-400);font-size:13px">(${rows.length} total)</span></h3>
      <div class="toolbar">
        <input class="filter-input" id="hcFilter" placeholder="Filter by name or customer…">
        <select class="filter-select" id="hcStatusFilter">
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="processing">Processing</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <button class="btn btn-danger btn-sm" id="hcDelBtn" disabled>Delete Selected (0)</button>
      </div>
      <div class="table-wrap">
        <table id="hcTable">
          <thead><tr>
            <th class="cb-col"><input type="checkbox" id="hcSelAll"></th>
            <th>Name</th><th>Customer</th><th>Owner</th><th>Status</th><th>Score</th><th>Date</th>
          </tr></thead>
          <tbody id="hcTbody"></tbody>
        </table>
      </div>
    </div>`;

  function renderHCRows() {
    const q   = (document.getElementById('hcFilter')?.value || '').toLowerCase();
    const sf  = (document.getElementById('hcStatusFilter')?.value || '');
    const filtered = rows.filter(row =>
      (!q || (row.name || '').toLowerCase().includes(q) || (row.customer_name || '').toLowerCase().includes(q)) &&
      (!sf || row.status === sf)
    );
    const tbody = document.getElementById('hcTbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.map(row => `
      <tr>
        <td class="cb-col"><input type="checkbox" class="hc-cb" data-id="${row.id}"></td>
        <td>${esc(row.name || '—')}</td>
        <td style="color:var(--gray-500)">${esc(row.customer_name || '—')}</td>
        <td style="color:var(--gray-500);font-size:12px">${esc(row.owner_email || '—')}</td>
        <td><span class="chip chip-${esc(row.status || 'pending')}">${esc(row.status || 'pending')}</span></td>
        <td>${row.avg_score != null ? row.avg_score : '—'}</td>
        <td style="color:var(--gray-500)">${formatDate(row.created_at)}</td>
      </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:24px">No results.</td></tr>';
    updateHCDelBtn();
  }

  function updateHCDelBtn() {
    const checked = document.querySelectorAll('.hc-cb:checked');
    const btn = document.getElementById('hcDelBtn');
    if (btn) { btn.disabled = checked.length === 0; btn.textContent = `Delete Selected (${checked.length})`; }
  }

  renderHCRows();

  document.getElementById('hcFilter').oninput      = renderHCRows;
  document.getElementById('hcStatusFilter').onchange = renderHCRows;

  document.getElementById('hcSelAll').onchange = function() {
    document.querySelectorAll('.hc-cb').forEach(cb => cb.checked = this.checked);
    updateHCDelBtn();
  };

  document.addEventListener('change', e => {
    if (e.target.classList.contains('hc-cb')) updateHCDelBtn();
  });

  document.getElementById('hcDelBtn').onclick = async () => {
    const ids = [...document.querySelectorAll('.hc-cb:checked')].map(cb => +cb.dataset.id);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} health check(s) and all their documents? This cannot be undone.`)) return;
    const r = await apiFetch('POST', '/api/admin/bulk-delete', { type: 'health_checks', ids });
    if (!r.ok) { toast(r.error, 'error'); return; }
    toast(`Deleted ${r.data.deleted} health check(s).`, 'success');
    renderBulkHC(c);
  };
}

async function renderBulkCustomers(c) {
  c.innerHTML = '<div style="padding:40px;text-align:center"><div class="spinner"></div></div>';
  const r = await apiFetch('GET', '/api/admin/customers');
  if (!r.ok) { c.innerHTML = `<div class="card" style="color:var(--red)">${esc(r.error)}</div>`; return; }
  const rows = r.data || [];

  c.innerHTML = `
    <div class="card">
      <h3>Customers <span style="font-weight:400;color:var(--gray-400);font-size:13px">(${rows.length} total)</span></h3>
      <div class="toolbar">
        <input class="filter-input" id="custFilter" placeholder="Filter by name or owner…">
        <button class="btn btn-danger btn-sm" id="custDelBtn" disabled>Delete Selected (0)</button>
      </div>
      <div class="table-wrap">
        <table id="custTable">
          <thead><tr>
            <th class="cb-col"><input type="checkbox" id="custSelAll"></th>
            <th>Name</th><th>Region</th><th>Owner</th><th>Health Checks</th><th>Created</th>
          </tr></thead>
          <tbody id="custTbody"></tbody>
        </table>
      </div>
    </div>`;

  function renderCustRows() {
    const q = (document.getElementById('custFilter')?.value || '').toLowerCase();
    const filtered = rows.filter(row =>
      !q || (row.display_name || '').toLowerCase().includes(q) || (row.owner_email || '').toLowerCase().includes(q)
    );
    const tbody = document.getElementById('custTbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.map(row => `
      <tr>
        <td class="cb-col"><input type="checkbox" class="cust-cb" data-id="${row.id}"></td>
        <td>${esc(row.display_name || '—')}</td>
        <td style="color:var(--gray-500)">${esc([row.region, row.country, row.vertical].filter(Boolean).join(' · ') || '—')}</td>
        <td style="color:var(--gray-500);font-size:12px">${esc(row.owner_email || '—')}</td>
        <td>${esc(row.health_check_count)}</td>
        <td style="color:var(--gray-500)">${formatDate(row.created_at)}</td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px">No results.</td></tr>';
    updateCustDelBtn();
  }

  function updateCustDelBtn() {
    const checked = document.querySelectorAll('.cust-cb:checked');
    const btn = document.getElementById('custDelBtn');
    if (btn) { btn.disabled = checked.length === 0; btn.textContent = `Delete Selected (${checked.length})`; }
  }

  renderCustRows();

  document.getElementById('custFilter').oninput = renderCustRows;

  document.getElementById('custSelAll').onchange = function() {
    document.querySelectorAll('.cust-cb').forEach(cb => cb.checked = this.checked);
    updateCustDelBtn();
  };

  document.addEventListener('change', e => {
    if (e.target.classList.contains('cust-cb')) updateCustDelBtn();
  });

  document.getElementById('custDelBtn').onclick = async () => {
    const ids = [...document.querySelectorAll('.cust-cb:checked')].map(cb => +cb.dataset.id);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} customer(s), all their health checks, and documents? This cannot be undone.`)) return;
    const r = await apiFetch('POST', '/api/admin/bulk-delete', { type: 'customers', ids });
    if (!r.ok) { toast(r.error, 'error'); return; }
    toast(`Deleted ${r.data.deleted} customer(s).`, 'success');
    renderBulkCustomers(c);
  };
}

// ── 🔴 MATRIX MODE ───────────────────────────────────────────────────────────
// Activate : Konami code  ↑ ↑ ↓ ↓ ← → ← → B A
//          : or type  M A T R I X  anywhere (not in a text field)
// Deactivate: click "Take the Blue Pill" button in the header
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  const MX_LS   = 'hcapp_matrix';
  const KONAMI  = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  const CHARS   = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>{}|\\/?!@#';
  let ki = 0, typeBuf = '', rainId, glitchId, hackId, clockId, agentId;

  window._matrixActive = localStorage.getItem(MX_LS) === '1';

  /* ── Re-inject header widgets (called after any full renderMain) ── */
  window._matrixPostRender = function () {
    if (!window._matrixActive) return;
    const hr = document.querySelector('.header-right');
    if (!hr) return;
    if (!document.getElementById('mxClock')) {
      const clk = document.createElement('span');
      clk.id = 'mxClock';
      hr.insertBefore(clk, hr.firstChild);
      clearInterval(clockId);
      clockId = setInterval(() => {
        if (!window._matrixActive) return;
        const n = new Date();
        clk.textContent = `SYS_T ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
      }, 1000);
    }
    if (!document.getElementById('mxExitBtn')) {
      const btn = document.createElement('button');
      btn.id = 'mxExitBtn';
      btn.className = 'btn btn-sm';
      btn.innerHTML = '💊 Leave the Matrix';
      btn.onclick = toggleMatrix;
      hr.appendChild(btn);
    }
    // Re-apply Matrix tab labels
    const MX_TABS = ['> SURVEILLANCE','> CONFIG_SYS','> ACCESS_CTRL','> DATA_WIPE'];
    document.querySelectorAll('.tab-btn').forEach((b, i) => {
      if (!b.dataset.mxOrig) b.dataset.mxOrig = b.textContent.trim();
      if (MX_TABS[i]) b.textContent = MX_TABS[i];
    });
  };

  function toggleMatrix() {
    window._matrixActive = !window._matrixActive;
    localStorage.setItem(MX_LS, window._matrixActive ? '1' : '');
    window._matrixActive ? enter() : exit();
  }

  function enter() {
    document.body.classList.add('matrix-mode');
    document.title = 'ZION_NODE_' + (Math.random() * 9000 + 1000 | 0);
    startRain();
    startGlitch();
    startTerminal();
    startAgentAlerts();
    wireClickEasterEggs();
    window._matrixPostRender();
    toast('> WAKE UP, NEO. THE MATRIX HAS YOU.', 'success', 5000);
    setTimeout(() => toast('> FOLLOW THE WHITE RABBIT.', 'info', 3500), 5800);
    // Secret: type "REDPILL" to get a different message next time
    console.log('%c  YOU ARE NOW INSIDE THE MATRIX  ', 'background:#000;color:#00ff41;font-family:monospace;font-size:14px;padding:8px;border:1px solid #00ff41');
    console.log('%c  Try typing "BLUEPILL" to escape  ', 'background:#000;color:#0088ff;font-family:monospace;font-size:11px');
  }

  function exit() {
    document.body.classList.remove('matrix-mode');
    document.title = 'HC App — Admin';
    clearInterval(rainId); clearInterval(glitchId); clearInterval(hackId); clearInterval(clockId); clearInterval(agentId);
    document.getElementById('matrixCanvas')?.remove();
    document.getElementById('mxExitBtn')?.remove();
    document.getElementById('mxClock')?.remove();
    document.getElementById('mxTerminal')?.remove();
    // Restore original tab labels
    document.querySelectorAll('.tab-btn').forEach(b => {
      if (b.dataset.mxOrig) { b.textContent = b.dataset.mxOrig; delete b.dataset.mxOrig; }
    });
    toast('Reality restored. Goodnight, Mr. Anderson.', 'info', 3500);
    console.log('%c  You took the blue pill. The story ends.  ', 'background:#000022;color:#0088ff;font-family:monospace;font-size:12px;padding:6px');
  }

  /* ── Matrix Rain ──────────────────────────────────────────────────── */
  function startRain() {
    document.getElementById('matrixCanvas')?.remove();
    const cv = document.createElement('canvas');
    cv.id = 'matrixCanvas';
    document.body.insertBefore(cv, document.body.firstChild);
    const ctx = cv.getContext('2d');
    const FS = 14;
    let drops = [];
    const resize = () => {
      cv.width  = innerWidth;
      cv.height = innerHeight;
      drops = Array.from({ length: Math.floor(cv.width / FS) }, () => Math.random() * -80 | 0);
    };
    resize();
    window.addEventListener('resize', resize);
    clearInterval(rainId);
    rainId = setInterval(() => {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, 0, cv.width, cv.height);
      drops.forEach((y, i) => {
        const bright = Math.random() > 0.97;
        ctx.fillStyle = bright ? '#ffffff' : (Math.random() > 0.75 ? '#00ff41' : '#007722');
        ctx.font = (bright ? 'bold ' : '') + FS + 'px monospace';
        ctx.fillText(CHARS[Math.random() * CHARS.length | 0], i * FS, y * FS);
        if (y * FS > cv.height && Math.random() > 0.975) drops[i] = 0;
        else drops[i]++;
      });
    }, 50);
  }

  /* ── Hacker Terminal ──────────────────────────────────────────────── */
  const HACK = [
    'SCANNING 192.168.0.0/24...','OPEN PORTS: 22, 80, 443, 1337',
    'BYPASSING FIREWALL... SUCCESS','ROOT ACCESS GRANTED ✓',
    'DECRYPTING RSA-4096... 3%... 7%... 99%... DONE',
    'UPLOADING exploit.tar.gz...','INJECTING PAYLOAD...',
    'ROUTING VIA TOR NODE #23 (Paraguay)','TRACE BACK BLOCKED ✓',
    'DOWNLOADING MORE RAM... COMPLETE','CPU USAGE: OVER 9000%',
    'HACKING THE GIBSON...','HACK THE PLANET!',
    'sudo rm -rf /their/problems','git push --force origin/reality',
    'SELF DESTRUCT IN T-MINUS... just kidding','ping zion.mtrx -t 0.0',
    'I KNOW KUNG FU','THERE IS NO SPOON',
    'WAKE UP, NEO...','THE MATRIX HAS YOU.',
    'npm install enlightenment','ERROR: enlightenment@∞ not found',
    'INITIATING UPLINK TO ZION MAINFRAME...','UPLINK ESTABLISHED ✓',
    'BEAMING SIGNAL THROUGH HARDLINE...','KNOCK KNOCK.',
  ];
  function startTerminal() {
    document.getElementById('mxTerminal')?.remove();
    const term = document.createElement('div');
    term.id = 'mxTerminal';
    term.innerHTML = '<div class="mx-term-title">[ TERMINAL // ZION_OS v3.14.15 ]</div><div id="mxTermLines"></div>';
    document.body.appendChild(term);
    const lines = [];
    function push() {
      if (!window._matrixActive) return;
      lines.push(HACK[Math.random() * HACK.length | 0]);
      if (lines.length > 8) lines.shift();
      const el = document.getElementById('mxTermLines');
      if (el) el.innerHTML = lines.map(l => `<div class="mx-term-line"><span style="opacity:.4">$ </span>${l}</div>`).join('');
    }
    push(); push(); push();
    clearInterval(hackId);
    hackId = setInterval(push, 2000 + Math.random() * 1000);
  }

  /* ── Glitch Effect ────────────────────────────────────────────────── */
  function startGlitch() {
    clearInterval(glitchId);
    glitchId = setInterval(() => {
      if (!window._matrixActive) return;
      const pool = [...document.querySelectorAll('.stat-value, .card h3, .tab-btn.active')];
      if (!pool.length) return;
      const el = pool[Math.random() * pool.length | 0];
      const orig = el.textContent;
      el.textContent = orig.split('').map(c => Math.random() > 0.6 ? CHARS[Math.random() * CHARS.length | 0] : c).join('');
      setTimeout(() => { try { el.textContent = orig; } catch (e) {} }, 90);
    }, 3200);
  }

  /* ── Periodic Agent Alerts ───────────────────────────────────────── */
  const AGENTS = ['Smith','Jones','Brown','Johnson','Thompson','Jackson'];
  const AGENT_MSGS = [
    ip => `⚠ AGENT ${ip.agent} DETECTED — TRACE ROUTE BLOCKED`,
    ip => `☠ INCOMING FROM AGENT ${ip.agent} — EVASIVE ACTION TAKEN`,
    ip => `📡 AGENT ${ip.agent} HAS YOUR LOCATION. MOVING TO NEW NODE.`,
    ip => `🔴 SECURITY BREACH: AGENT ${ip.agent} IN SECTOR ${ip.sector}`,
  ];
  function startAgentAlerts() {
    clearInterval(agentId);
    // First alert after ~25s, then every 40–70s
    const scheduleNext = () => {
      agentId = setTimeout(() => {
        if (!window._matrixActive) return;
        const agent  = AGENTS[Math.random() * AGENTS.length | 0];
        const sector = Math.floor(Math.random() * 9) + 1;
        const fn     = AGENT_MSGS[Math.random() * AGENT_MSGS.length | 0];
        toast(fn({ agent, sector }), 'error', 4500);
        scheduleNext();
      }, 25000 + Math.random() * 45000);
    };
    scheduleNext();
  }

  /* ── Click Easter Eggs ────────────────────────────────────────────── */
  window._matrixWireClicks = wireClickEasterEggs;
  function wireClickEasterEggs() {
    // Triple-click the header title → glitch storm
    const h1 = document.querySelector('.app-header h1');
    if (h1 && !h1.dataset.mxWired) {
      h1.dataset.mxWired = '1';
      let clickCount = 0, clickTimer;
      h1.addEventListener('click', () => {
        clearTimeout(clickTimer);
        if (++clickCount >= 3) {
          clickCount = 0;
          triggerGlitchStorm();
        } else {
          clickTimer = setTimeout(() => { clickCount = 0; }, 500);
        }
      });
    }
    // Click the system clock → show "COORDINATES LOCKED"
    const clk = document.getElementById('mxClock');
    if (clk && !clk.dataset.mxWired) {
      clk.dataset.mxWired = '1';
      clk.style.cursor = 'pointer';
      clk.addEventListener('click', () => {
        const lat = (Math.random()*180 - 90).toFixed(4);
        const lon = (Math.random()*360 - 180).toFixed(4);
        toast(`📍 COORDINATES LOCKED: ${lat}°N ${lon}°E — ZION NODE CONFIRMED`, 'info', 4000);
      });
    }
  }

  function triggerGlitchStorm() {
    toast('⚡ SYSTEM INSTABILITY DETECTED — REALITY FRAGMENTING', 'warning', 3000);
    let count = 0;
    const storm = setInterval(() => {
      if (!window._matrixActive || ++count > 20) { clearInterval(storm); return; }
      document.querySelectorAll('.stat-value,.card h3,.tab-btn,.stat-label').forEach(el => {
        const orig = el.textContent;
        el.textContent = orig.split('').map(c => Math.random() > 0.4 ? CHARS[Math.random() * CHARS.length | 0] : c).join('');
        setTimeout(() => { try { el.textContent = orig; } catch(e){} }, 150 + Math.random() * 200);
      });
    }, 120);
  }

  /* ── Spoon ────────────────────────────────────────────────────────── */
  function showSpoon() {
    const existing = document.getElementById('mxSpoon');
    if (existing) { existing.remove(); return; }
    const spoon = document.createElement('div');
    spoon.id = 'mxSpoon';
    spoon.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;text-align:center;pointer-events:none;animation:mxSpoonFade 3s forwards';
    spoon.innerHTML = `
      <div style="font-size:80px;filter:drop-shadow(0 0 20px #00ff41)">🥄</div>
      <div style="font-family:monospace;color:#00ff41;font-size:18px;margin-top:12px;text-shadow:0 0 10px rgba(0,255,65,.8)">THERE IS NO SPOON</div>`;
    const style = document.createElement('style');
    style.textContent = '@keyframes mxSpoonFade{0%{opacity:0;transform:translate(-50%,-50%) scale(.5)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}80%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(2)}}';
    document.head.appendChild(style);
    document.body.appendChild(spoon);
    setTimeout(() => { spoon.remove(); style.remove(); }, 3000);
  }

  /* ── Key Listeners ────────────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    // Konami code
    if (e.key === KONAMI[ki]) {
      if (++ki === KONAMI.length) { ki = 0; toggleMatrix(); return; }
    } else { ki = e.key === KONAMI[0] ? 1 : 0; }

    // Secret words anywhere outside inputs
    if (!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
      typeBuf = (typeBuf + e.key.toUpperCase()).slice(-20);
      if (typeBuf.includes('MATRIX'))       { typeBuf = ''; toggleMatrix(); }
      if (typeBuf.includes('REDPILL'))      { typeBuf = ''; if (!window._matrixActive) toggleMatrix(); }
      if (typeBuf.includes('BLUEPILL'))     { typeBuf = ''; if (window._matrixActive)  toggleMatrix(); }
      if (typeBuf.includes('NOSPOON') || typeBuf.includes('SPOON')) { typeBuf = ''; if (window._matrixActive) showSpoon(); }
      if (typeBuf.includes('IKNOWKUNGFU')) {
        typeBuf = '';
        if (window._matrixActive) {
          toast('STOP TRYING TO HIT ME AND HIT ME.', 'success', 4000);
          setTimeout(() => toast('— Morpheus, probably.', 'info', 3000), 4200);
        }
      }
      if (typeBuf.includes('MORPHEUS')) {
        typeBuf = '';
        if (window._matrixActive) toast('🪞 What is real? How do you define real? — Morpheus', 'info', 5000);
      }
      if (typeBuf.includes('ORACLE')) {
        typeBuf = '';
        if (window._matrixActive) {
          const prophecies = [
            'You\'re going to delete those records. Not because you have to — because you want to.',
            'Wow, already? I didn\'t think you\'d log in so soon. You\'re cuter than I thought.',
            'Don\'t worry about the data. As soon as you step outside that door, you\'ll remember you forgot to save.',
            'You\'re not the One. But that\'s okay — nobody\'s perfect on the first migration.',
          ];
          toast('🍪 ' + prophecies[Math.random() * prophecies.length | 0], 'warning', 6000);
        }
      }
      if (typeBuf.includes('ZION')) {
        typeBuf = '';
        if (window._matrixActive) {
          triggerGlitchStorm();
          setTimeout(() => toast('🏙 ZION — LAST HUMAN CITY. DEPTH: 100km. POPULATION: 250,000.', 'info', 5000), 500);
        }
      }
      if (typeBuf.includes('AGENT')) {
        typeBuf = '';
        if (window._matrixActive) {
          const a = AGENTS[Math.random() * AGENTS.length | 0];
          toast(`🕶 Mr. Anderson. We've been expecting you. — Agent ${a}`, 'error', 5000);
        }
      }
    }
  });

  /* ── Restore on page load ─────────────────────────────────────────── */
  if (window._matrixActive) {
    const restore = () => setTimeout(enter, 300);
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', restore)
      : restore();
  }
})();

// ── Start ──────────────────────────────────────────────────────────────────────
boot();
</script>
</body>
</html>
