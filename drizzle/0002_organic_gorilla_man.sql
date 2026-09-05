ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_role_id_pk";--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "role_id" uuid;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_roles_group_idx" ON "user_roles" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "positions_group_idx" ON "positions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "positions_role_idx" ON "positions" USING btree ("role_id");--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_unique" UNIQUE NULLS NOT DISTINCT("user_id","role_id","group_id");
--> statement-breakpoint
--
-- Fremdschluessel fuer user_roles.group_id.
--
-- Steht hier von Hand, weil `groups` in schema/members.ts liegt und members.ts
-- seinerseits `roles` aus schema/auth.ts braucht (positions.roleId). Ein
-- references() in auth.ts waere ein gegenseitiger Import zwischen den beiden
-- Schemadateien.
--
-- ON DELETE CASCADE: wird eine Gruppe geloescht, verschwinden die Zuweisungen
-- mit, die nur fuer sie galten. Ohne CASCADE bliebe eine Rolle mit einer
-- Gruppenkennung stehen, die es nicht mehr gibt -- sie wuerde nirgends mehr
-- greifen und waere in keiner Uebersicht auffindbar.
--
ALTER TABLE "user_roles"
    ADD CONSTRAINT "user_roles_group_id_groups_id_fk"
    FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade;--> statement-breakpoint

--
-- Bestandsdaten uebernehmen: Aemter vom Typ "gruppenleiter" bekommen die
-- Systemrolle "gruppenleitung".
--
-- Bisher entstand der Gruppenbezug allein aus positions.type = 'gruppenleiter';
-- Rechte trug das Amt keine. Ohne diesen Schritt verloeren alle bestehenden
-- Gruppenleitungen beim Aufspielen ihre Rechte, weil die alte Namensreihe
-- groupleader.* entfallen ist.
--
-- Die Rolle selbst legt ensureDefaultRoles() beim Start an; existiert sie hier
-- noch nicht, tut die Anweisung schlicht nichts.
--
UPDATE "positions"
SET "role_id" = (SELECT "id" FROM "roles" WHERE "key" = 'gruppenleitung')
WHERE "type" = 'gruppenleiter'
  AND "role_id" IS NULL
  AND EXISTS (SELECT 1 FROM "roles" WHERE "key" = 'gruppenleitung');
