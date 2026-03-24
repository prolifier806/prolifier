-- ============================================================
-- Multilingual blocked words — Indian, Arabic, Turkish, Indonesian
-- Roman script / transliteration
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- Hindi / Urdu
-- ============================================================
INSERT INTO blocked_words (word, severity, category) VALUES
('bhenchod', 'block', 'sexual'),
('bhen chod', 'block', 'sexual'),
('bhnchd', 'block', 'sexual'),
('bc', 'flag', 'sexual'),
('madarchod', 'block', 'sexual'),
('madar chod', 'block', 'sexual'),
('madarchut', 'block', 'sexual'),
('mc', 'flag', 'sexual'),
('bmkb', 'flag', 'sexual'),
('chutiya', 'block', 'sexual'),
('chut', 'block', 'sexual'),
('choot', 'block', 'sexual'),
('bhosdike', 'block', 'sexual'),
('bhosdiwale', 'block', 'sexual'),
('bhosdika', 'block', 'sexual'),
('lund', 'block', 'sexual'),
('loda', 'block', 'sexual'),
('lauda', 'block', 'sexual'),
('lodu', 'block', 'sexual'),
('gaand', 'block', 'sexual'),
('gand', 'block', 'sexual'),
('gaandu', 'block', 'sexual'),
('gandu', 'block', 'sexual'),
('randi', 'block', 'sexual'),
('rande', 'block', 'sexual'),
('randwa', 'block', 'sexual'),
('bitch teri maa', 'block', 'sexual'),
('teri maa ki', 'block', 'sexual'),
('teri maa', 'flag', 'sexual'),
('teri behen', 'flag', 'sexual'),
('tere baap', 'flag', 'sexual'),
('haraami', 'flag', 'harassment'),
('harami', 'flag', 'harassment'),
('kutta', 'flag', 'harassment'),
('kutte', 'flag', 'harassment'),
('kamina', 'flag', 'harassment'),
('kamine', 'flag', 'harassment'),
('saala', 'flag', 'harassment'),
('sali', 'flag', 'harassment'),
('ullu', 'flag', 'harassment'),
('ullu ka pattha', 'flag', 'harassment'),
('bakwaas', 'flag', 'harassment'),
('besharam', 'flag', 'harassment'),
('nikamma', 'flag', 'harassment'),
('napunsak', 'block', 'harassment'),
('hijra', 'block', 'slur'),
('hijda', 'block', 'slur'),
('chakka', 'block', 'slur'),
('behenke lode', 'block', 'sexual'),
('bklol', 'flag', 'harassment'),
('mkbc', 'flag', 'sexual'),
('lmao teri maa', 'block', 'sexual'),
-- Casteist slurs
('chamar', 'block', 'casteist'),
('chamaar', 'block', 'casteist'),
('bhangi', 'block', 'casteist'),
('maang', 'block', 'casteist'),
('dhed', 'block', 'casteist'),
('dhor', 'block', 'casteist'),
('neech jaat', 'block', 'casteist'),
('neech', 'flag', 'casteist'),
-- Religious slurs
('katua', 'block', 'slur'),
('katwa', 'block', 'slur'),
('kafir', 'flag', 'slur'),
('mullah', 'flag', 'slur'),
('jihadi', 'flag', 'slur'),
('terrorist mullah', 'block', 'slur')
ON CONFLICT (word) DO NOTHING;

-- ============================================================
-- Punjabi
-- ============================================================
INSERT INTO blocked_words (word, severity, category) VALUES
('penchod', 'block', 'sexual'),
('pen chod', 'block', 'sexual'),
('pc', 'flag', 'sexual'),
('mothchod', 'block', 'sexual'),
('mada chod', 'block', 'sexual'),
('khota', 'flag', 'harassment'),
('dallay', 'block', 'sexual'),
('dalla', 'block', 'sexual'),
('tatti', 'flag', 'harassment'),
('gashti', 'block', 'sexual'),
('lun', 'block', 'sexual')
ON CONFLICT (word) DO NOTHING;

-- ============================================================
-- Tamil
-- ============================================================
INSERT INTO blocked_words (word, severity, category) VALUES
('punda', 'block', 'sexual'),
('pundamavane', 'block', 'sexual'),
('pundachi', 'block', 'sexual'),
('oombu', 'block', 'sexual'),
('thevdiya', 'block', 'sexual'),
('thevdiyapaya', 'block', 'sexual'),
('sunni', 'block', 'sexual'),
('koothi', 'block', 'sexual'),
('loosu', 'flag', 'harassment'),
('baadu', 'flag', 'harassment'),
('naye', 'flag', 'harassment'),
('soothu', 'block', 'sexual'),
('otha', 'block', 'sexual'),
('ottiya', 'block', 'sexual'),
('naaye', 'flag', 'harassment'),
-- Casteist
('parayan', 'block', 'casteist'),
('pallan', 'block', 'casteist'),
('sakkiliyar', 'block', 'casteist')
ON CONFLICT (word) DO NOTHING;

-- ============================================================
-- Telugu
-- ============================================================
INSERT INTO blocked_words (word, severity, category) VALUES
('dengey', 'block', 'sexual'),
('dengu', 'block', 'sexual'),
('dengina', 'block', 'sexual'),
('puku', 'block', 'sexual'),
('modda', 'block', 'sexual'),
('gudda', 'flag', 'sexual'),
('lanjha', 'block', 'sexual'),
('lanja', 'block', 'sexual'),
('lanjakodaka', 'block', 'sexual'),
('donga', 'flag', 'harassment'),
('naakodaka', 'block', 'sexual'),
-- Casteist
('madiga', 'flag', 'casteist')
ON CONFLICT (word) DO NOTHING;

-- ============================================================
-- Bengali
-- ============================================================
INSERT INTO blocked_words (word, severity, category) VALUES
('bokachoda', 'block', 'sexual'),
('boka choda', 'block', 'sexual'),
('banchod', 'block', 'sexual'),
('khanki', 'block', 'sexual'),
('khanki magi', 'block', 'sexual'),
('magi', 'block', 'sexual'),
('shala', 'flag', 'harassment'),
('shali', 'flag', 'harassment'),
('chhagal', 'flag', 'harassment'),
('kukur', 'flag', 'harassment'),
('tor maa', 'block', 'sexual'),
('toder maa', 'block', 'sexual'),
('haramzada', 'block', 'harassment'),
('haramjada', 'block', 'harassment'),
('khankir chele', 'block', 'sexual'),
('chudi', 'block', 'sexual'),
('chude', 'block', 'sexual')
ON CONFLICT (word) DO NOTHING;

-- ============================================================
-- Kannada
-- ============================================================
INSERT INTO blocked_words (word, severity, category) VALUES
('tike', 'block', 'sexual'),
('thike', 'block', 'sexual'),
('hende', 'block', 'sexual'),
('sule', 'block', 'sexual'),
('sulemaganey', 'block', 'sexual'),
('boli', 'block', 'sexual'),
('bolimaga', 'block', 'sexual'),
('nin amma', 'block', 'sexual'),
('nin akka', 'block', 'sexual'),
('bekku', 'flag', 'harassment'),
('muchkond hogi', 'flag', 'harassment'),
-- Casteist
('holeya', 'block', 'casteist')
ON CONFLICT (word) DO NOTHING;

-- ============================================================
-- Arabic (Gulf, Levantine, Egyptian — Roman transliteration)
-- ============================================================
INSERT INTO blocked_words (word, severity, category) VALUES
('kos omak', 'block', 'sexual'),
('kos ommak', 'block', 'sexual'),
('kos okhtak', 'block', 'sexual'),
('kos okhto', 'block', 'sexual'),
('kuss', 'block', 'sexual'),
('kus', 'block', 'sexual'),
('ayr', 'block', 'sexual'),
('zibbi', 'block', 'sexual'),
('zebbi', 'block', 'sexual'),
('teez', 'flag', 'sexual'),
('tizz', 'flag', 'sexual'),
('sharmouta', 'block', 'sexual'),
('sharmuta', 'block', 'sexual'),
('ibn el sharmouta', 'block', 'sexual'),
('ibn sharmouta', 'block', 'sexual'),
('bint el sharmouta', 'block', 'sexual'),
('ahba', 'block', 'sexual'),
('qahba', 'block', 'sexual'),
('kahba', 'block', 'sexual'),
('kahbe', 'block', 'sexual'),
('metnak', 'block', 'sexual'),
('metnakk', 'block', 'sexual'),
('nayek', 'block', 'sexual'),
('yel an', 'flag', 'harassment'),
('yelan abu', 'block', 'harassment'),
('kalb', 'flag', 'harassment'),
('kelb', 'flag', 'harassment'),
('ibn el kalb', 'block', 'harassment'),
('ibn kelb', 'block', 'harassment'),
('himaar', 'flag', 'harassment'),
('himar', 'flag', 'harassment'),
('ibn el himar', 'block', 'harassment'),
('khara', 'flag', 'harassment'),
('khara alek', 'block', 'harassment'),
('ya khara', 'block', 'harassment'),
('gazma', 'flag', 'harassment'),
('weld el haram', 'block', 'harassment'),
('walad haram', 'block', 'harassment'),
('ibn haram', 'block', 'harassment'),
('ayir fi', 'block', 'sexual'),
('da ayrr', 'block', 'sexual')
ON CONFLICT (word) DO NOTHING;

-- ============================================================
-- Turkish (Roman script)
-- ============================================================
INSERT INTO blocked_words (word, severity, category) VALUES
('siktir', 'block', 'sexual'),
('orospu', 'block', 'sexual'),
('orospu cocugu', 'block', 'sexual'),
('orospunun dogurdugu', 'block', 'sexual'),
('amk', 'flag', 'sexual'),
('bok', 'flag', 'harassment'),
('boktan', 'flag', 'harassment'),
('amina koyayim', 'block', 'sexual'),
('amina koy', 'block', 'sexual'),
('amina', 'flag', 'sexual'),
('sikeyim', 'block', 'sexual'),
('gotten sikeyim', 'block', 'sexual'),
('dalyarak', 'block', 'sexual'),
('yarak', 'block', 'sexual'),
('yarrak', 'block', 'sexual'),
('ibne', 'block', 'slur'),
('ibni', 'block', 'slur'),
('pust', 'block', 'slur'),
('senin ananı', 'block', 'sexual'),
('anan', 'flag', 'sexual'),
('anani', 'flag', 'sexual'),
('anasini', 'block', 'sexual'),
('koyayim', 'block', 'sexual'),
('essek', 'flag', 'harassment'),
('aptal', 'flag', 'harassment'),
('salak', 'flag', 'harassment'),
('geri zekalı', 'flag', 'harassment'),
('piç', 'block', 'harassment'),
('pic', 'block', 'harassment'),
('kahpe', 'block', 'sexual'),
('pezevenk', 'block', 'sexual'),
('got oglani', 'block', 'slur')
ON CONFLICT (word) DO NOTHING;

-- ============================================================
-- Indonesian / Malay (Roman script)
-- ============================================================
INSERT INTO blocked_words (word, severity, category) VALUES
('kontol', 'block', 'sexual'),
('kontool', 'block', 'sexual'),
('memek', 'block', 'sexual'),
('meki', 'block', 'sexual'),
('ngentot', 'block', 'sexual'),
('entot', 'block', 'sexual'),
('ngewe', 'block', 'sexual'),
('ngewek', 'block', 'sexual'),
('jembut', 'block', 'sexual'),
('pepek', 'block', 'sexual'),
('titit', 'block', 'sexual'),
('toket', 'block', 'sexual'),
('coli', 'flag', 'sexual'),
('colmek', 'block', 'sexual'),
('anjing', 'flag', 'harassment'),
('anjir', 'flag', 'harassment'),
('asu', 'flag', 'harassment'),
('babi', 'flag', 'harassment'),
('bangsat', 'block', 'harassment'),
('bajingan', 'block', 'harassment'),
('keparat', 'block', 'harassment'),
('kurang ajar', 'block', 'harassment'),
('brengsek', 'flag', 'harassment'),
('tai', 'flag', 'harassment'),
('tolol', 'flag', 'harassment'),
('goblok', 'flag', 'harassment'),
('sial', 'flag', 'harassment'),
('kampret', 'flag', 'harassment'),
('jancok', 'block', 'sexual'),
('jancuk', 'block', 'sexual'),
('matamu', 'flag', 'harassment'),
('matane', 'flag', 'harassment'),
('asu kowe', 'block', 'harassment'),
('cuki mai', 'block', 'sexual'),
('cukimak', 'block', 'sexual'),
('pukimak', 'block', 'sexual'),
('brengsek lu', 'block', 'harassment'),
('mampus', 'flag', 'harassment')
ON CONFLICT (word) DO NOTHING;
