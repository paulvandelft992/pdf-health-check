<?php
declare(strict_types=1);

// ─── Person-name detector ─────────────────────────────────────────────────────
//
// Two-layer system:
//   Layer 1  — Oracle: exact-match majority-vote from pii_feedback table.
//              If a human has previously confirmed or denied this author string
//              that decision overrides everything else (confidence = 100).
//   Layer 2  — Heuristic: weighted feature scorer (personNameScore).
//              Normalised to 0-100 for display; threshold ≥ 35 raw points → person name.
//
// Maximum raw score breakdown:
//   +40  first word in known first-name corpus
//   +20  all words match title-case name pattern
//   +15  exactly 2 words  (+10 for 3, +5 for 4)
//   ─────
//    75  maximum → maps to 100 % display confidence
//
// Decision threshold: score ≥ 35 raw points → person name.

/**
 * Returns detection result with confidence metadata.
 *
 * Return shape:
 *   [
 *     'is_person'  => bool,
 *     'confidence' => int,           // 0–100
 *     'source'     => 'confirmed'    // oracle — previous human feedback
 *                   | 'heuristic'   // weighted rule-based scorer
 *                   | 'rejected',   // heuristic hard-reject (confidence = 0)
 *   ]
 *
 * @param PDO    $db     Live database connection.
 * @param string $author Raw author string from PDF metadata.
 * @return array{is_person: bool, confidence: int, source: string}
 */
function personNameConfidence(PDO $db, string $author): array {
    $author = trim($author);
    if ($author === '') {
        return ['is_person' => false, 'confidence' => 0, 'source' => 'rejected'];
    }

    // ── Layer 1: Oracle ────────────────────────────────────────────────────
    try {
        $stmt = $db->prepare("
            SELECT
                SUM(is_person_name)         AS positive_votes,
                SUM(1 - is_person_name)     AS negative_votes
            FROM pii_feedback
            WHERE author_value = ?
        ");
        $stmt->execute([$author]);
        $votes = $stmt->fetch();
        if ($votes && ($votes['positive_votes'] + $votes['negative_votes']) > 0) {
            $isPerson = (int)$votes['positive_votes'] >= (int)$votes['negative_votes'];
            return [
                'is_person'  => $isPerson,
                'confidence' => 100,
                'source'     => 'confirmed',
            ];
        }
    } catch (\Throwable $e) {
        error_log('[pii_feedback] lookup failed: ' . $e->getMessage());
    }

    // ── Layer 2: Learned first-name corpus ────────────────────────────────
    $learnedFirstNames = [];
    try {
        $learnedStmt = $db->query("
            SELECT DISTINCT LOWER(SUBSTRING_INDEX(TRIM(author_value), ' ', 1)) AS first_word
            FROM pii_feedback
            WHERE is_person_name = 1 AND TRIM(author_value) != ''
            LIMIT 500
        ");
        $learnedFirstNames = array_flip($learnedStmt->fetchAll(PDO::FETCH_COLUMN) ?: []);
    } catch (\Throwable $e) {
        // Falls back to static corpus only
    }

    // ── Layer 3: Heuristic scorer ─────────────────────────────────────────
    $score    = personNameScore($author, $learnedFirstNames);
    $isPerson = $score >= 35;

    // Normalise raw score to 0-100 display confidence.
    // The practical ceiling is 75 (corpus+title-case+2-word bonuses).
    // Scores below threshold still get a non-zero percentage so the UI can
    // show "low confidence" for borderline cases if needed in future.
    $confidence = $score > 0
        ? (int)min(100, (int)round($score / 75 * 100))
        : 0;

    return [
        'is_person'  => $isPerson,
        'confidence' => $confidence,
        'source'     => $isPerson ? 'heuristic' : 'rejected',
    ];
}

/**
 * Convenience bool wrapper — used by the document-processing path where only
 * the binary decision is needed, not the confidence metadata.
 *
 * @param PDO    $db
 * @param string $author
 */
function isProbablyPersonName(PDO $db, string $author): bool {
    return personNameConfidence($db, $author)['is_person'];
}

/**
 * Weighted heuristic scorer.  Returns a raw integer score; caller decides
 * the threshold.  Pass $learnedFirstNames (keyed array of first-word → 0)
 * to award the corpus bonus for names learned from past feedback.
 *
 * @param string $author
 * @param array  $learnedFirstNames  Keys are lowercase first words, values ignored.
 * @return int
 */
function personNameScore(string $author, array $learnedFirstNames = []): int {
    $author = trim($author);
    if (strlen($author) < 3 || strlen($author) > 80) return 0;

    // ── Hard rejects ──────────────────────────────────────────────────────
    if (preg_match('/\d/', $author))                        return 0;
    if (preg_match('/[@\[\]\{\}|<>#\/\\\\]/', $author))    return 0;

    $lower = strtolower($author);

    // Company / org / app keywords — instant reject
    $stopWords = [
        'adobe','microsoft','google','apple','libreoffice','openoffice',
        'foxit','nitro','pdf','acrobat','office','excel','powerpoint','word',
        'inc','ltd','llc','corp','co.','gmbh','s.a.','ag','bv','plc',
        'company','organisation','organization','foundation','institute',
        'department','dept','division','group','team','services','solutions',
        'version','copyright','user','admin','administrator','owner',
        'unknown','default','author','system','anonymous','untitled',
        'government','ministry','agency','bureau','authority','council',
        'university','college','school','bank','hospital','clinic','trust',
        'consulting','management','technology','technologies','software',
        'publishing','media','communications','international',
    ];
    foreach ($stopWords as $kw) {
        if (str_contains($lower, $kw)) return 0;
    }

    $words = preg_split('/\s+/', $author);
    $wc    = count($words);

    // Must be 2–4 words
    if ($wc < 2 || $wc > 4) return 0;

    // ── Positive features ─────────────────────────────────────────────────
    $score = 0;

    // Word-count bonus
    if ($wc === 2)      $score += 15;
    elseif ($wc === 3)  $score += 10;
    else                $score += 5;

    // Title-case name pattern: each word starts with capital + lowercase letters,
    // allows hyphenated (McDouall, O'Brien) and initials (J.)
    $namePattern = '/^[A-Z][a-z]+([-\'][A-Z][a-z]+)?$|^[A-Z]{1,3}[.]?$/';
    $titleWords  = 0;
    foreach ($words as $word) {
        if (preg_match($namePattern, $word)) $titleWords++;
    }
    if ($titleWords >= $wc)          $score += 20;  // every word looks like a name
    elseif ($titleWords >= $wc - 1)  $score += 10;  // all-but-one match

    // If fewer than half the words match name pattern, likely not a person name
    if ($titleWords < intdiv($wc, 2) + 1) return 0;

    // First-name corpus match on the first word (case-insensitive)
    $firstWord  = strtolower($words[0]);
    $firstNames = array_flip([
        // English / Western
        'james','john','robert','michael','william','david','richard','joseph',
        'thomas','charles','christopher','daniel','matthew','anthony','mark',
        'donald','steven','paul','andrew','joshua','kenneth','kevin','brian',
        'george','timothy','ronald','edward','jason','jeffrey','ryan','jacob',
        'gary','nicholas','eric','jonathan','stephen','larry','justin','scott',
        'brandon','benjamin','samuel','raymond','gregory','frank','alexander',
        'patrick','raymond','jack','dennis','jerry','tyler','aaron','jose',
        'adam','henry','nathan','zachary','peter','walter','harold','douglas',
        'arthur','carl','peter','roger','joe','alan','juan','gerald','keith',
        // Female English
        'mary','patricia','jennifer','linda','barbara','elizabeth','susan',
        'jessica','sarah','karen','lisa','nancy','betty','margaret','sandra',
        'ashley','dorothy','kimberly','emily','donna','michelle','carol','amanda',
        'melissa','deborah','stephanie','sharon','laura','cynthia','kathleen',
        'amy','angela','shirley','anna','brenda','pamela','emma','nicole',
        'helen','samantha','katherine','christine','debra','rachel','carolyn',
        'janet','catherine','maria','heather','diane','julia','joyce','victoria',
        'kelly','christina','lauren','joan','evelyn','olivia','judith','megan',
        'cheryl','alice','ann','jean','danielle','kathryn','hannah','virginia',
        'andrea','brittany','jacqueline','ashley','madison','sophia','isabella',
        // European / international common
        'luca','marco','mario','antonio','luigi','giovanni','giuseppe','matteo',
        'nicolas','pierre','jean','michel','francois','henri','marie','claire',
        'anne','sophie','camille','lea','manon','juliette','elise','julie',
        'hans','peter','karl','stefan','thomas','markus','michael','sebastian',
        'lukas','anna','lena','julia','laura','sarah','maria','eva',
        'jose','carlos','juan','pedro','miguel','francisco','antonio','rafael',
        'luis','sergio','alejandro','pablo','manuel','jorge','alberto','ana',
        'isabel','carmen','lucia','elena','pilar','cristina','rosa','marta',
        'jan','koen','piet','dirk','wim','anne','inge','els','nathalie',
        'erik','lars','sven','anders','per','magnus','nina','ingrid','astrid',
        'yuki','kenji','hiroshi','takeshi','naomi','yoko','sakura','haruto',
        'wei','li','ming','yan','fang','xiao','ling','hui','jing',
        'ahmed','ali','omar','hassan','fatima','aisha','layla','zaid',
        'priya','rahul','amit','deepa','kavya','sunita','ananya','arjun',
        'olga','sergei','ivan','natasha','dmitri','elena','tatiana','andrei',
        // Common compound / prefixed first names
        'jean-pierre','jean-paul','mary-anne','anne-marie','jo','sue','rob',
        'mike','dave','tom','ben','sam','kate','kate','emma','alice','henry',
        'jim','bob','bill','tim','dan','phil','ed','max','leo','felix',
        'eleanor','grace','rose','violet','iris','ivy','ruby','pearl','vera',
    ]);

    // Static first-name corpus match
    if (isset($firstNames[$firstWord]))         $score += 40;
    // Learned first-name corpus from user feedback (same weight)
    elseif (isset($learnedFirstNames[$firstWord])) $score += 40;

    return $score;
}
