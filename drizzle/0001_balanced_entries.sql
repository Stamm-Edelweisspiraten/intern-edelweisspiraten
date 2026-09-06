-- Doppelte Buchfuehrung: Soll gleich Haben.
--
-- Die Pruefung laeuft als AUFGESCHOBENER Constraint-Trigger. Waere sie
-- unmittelbar, koennte ein Buchungssatz nie entstehen: nach dem Einfuegen der
-- ersten Zeile ist er zwangslaeufig unausgeglichen. So wird erst beim COMMIT
-- geprueft, und ein unausgeglichener Satz kann die Transaktion nicht
-- verlassen -- unabhaengig davon, ob er ueber die Oberflaeche, die REST-API
-- oder von Hand per SQL entstanden ist.

CREATE OR REPLACE FUNCTION assert_entry_balanced() RETURNS trigger AS $$
DECLARE
    target_entry uuid;
    total_debit  bigint;
    total_credit bigint;
    line_count   integer;
BEGIN
    target_entry := COALESCE(NEW.entry_id, OLD.entry_id);

    -- Der Buchungssatz selbst kann in derselben Transaktion geloescht worden
    -- sein; dann gibt es nichts mehr zu pruefen.
    IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE id = target_entry) THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
      INTO total_debit, total_credit, line_count
      FROM journal_lines
     WHERE entry_id = target_entry;

    IF line_count < 2 THEN
        RAISE EXCEPTION
            'Buchungssatz % hat % Zeile(n); mindestens zwei sind noetig.',
            target_entry, line_count
            USING ERRCODE = 'check_violation';
    END IF;

    IF total_debit <> total_credit THEN
        RAISE EXCEPTION
            'Buchungssatz % ist nicht ausgeglichen: Soll % Cent, Haben % Cent.',
            target_entry, total_debit, total_credit
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER journal_lines_balanced
    AFTER INSERT OR UPDATE OR DELETE ON journal_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_entry_balanced();
--> statement-breakpoint

-- Ein Buchungssatz ohne Zeilen ist ebenfalls unzulaessig. Der Trigger oben
-- greift nur, wenn ueberhaupt eine Zeile angefasst wurde.
CREATE OR REPLACE FUNCTION assert_entry_has_lines() RETURNS trigger AS $$
DECLARE
    line_count integer;
BEGIN
    SELECT COUNT(*) INTO line_count FROM journal_lines WHERE entry_id = NEW.id;

    IF line_count = 0 THEN
        RAISE EXCEPTION 'Buchungssatz % hat keine Zeilen.', NEW.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER journal_entries_have_lines
    AFTER INSERT ON journal_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_entry_has_lines();
--> statement-breakpoint

-- Ein abgeschlossenes oder archiviertes Geschaeftsjahr nimmt keine Buchungen
-- mehr auf. Bisher stand diese Regel nur im Anwendungscode und galt damit
-- nicht fuer Zugriffe, die daran vorbeigehen.
CREATE OR REPLACE FUNCTION assert_year_open() RETURNS trigger AS $$
DECLARE
    year_status text;
    year_label  integer;
BEGIN
    SELECT status::text, year INTO year_status, year_label
      FROM fiscal_years WHERE id = NEW.fiscal_year_id;

    IF year_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION
            'Im Geschaeftsjahr % kann nicht gebucht werden (Status %).',
            year_label, year_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER journal_entries_year_open
    BEFORE INSERT ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION assert_year_open();
