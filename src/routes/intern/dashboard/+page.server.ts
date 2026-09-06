import type { PageServerLoad } from "./$types";
import { groupsWithPermission, requirePermission } from "$lib/server/permissionGuard";
import { getAllMembers } from "$lib/server/memberService";
import { getAllGroups } from "$lib/server/groupService";
import { computeOutstanding } from "$lib/server/finance/invoiceService";
import { agingReport } from "$lib/server/finance/reportService";
import { listFiscalYears } from "$lib/server/finance/yearService";
import { listOrdersForMembers } from "$lib/server/kaemmerer/orderService";
import { listEvents, getOwnResponses } from "$lib/server/eventService";
import { listSurveys } from "$lib/server/surveyService";
import { matchesPermission } from "$lib/permissions/match";
import { sumCents } from "$lib/money";

interface UpcomingBirthday {
    id: string;
    firstname: string;
    group: string;
    dateISO: string;
    dateLabel: string;
    age: number;
    inDays: number;
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "dashboard.view");

    const userName = event.locals.user?.userinfo?.name ?? event.locals.user?.userinfo?.email ?? "Willkommen";

    // Mitglieder, die diesem Zugang zugeordnet sind -- Grundlage fuer die
    // persoenlichen Kacheln (offene Posten und Bestellungen).
    const memberIds = event.locals.user?.memberIds ?? [];

    const canSeeEvents = matchesPermission(event.locals.permissions ?? [], "events.view");

    /**
     * Die Faelligkeitsstaffel zeigt die offenen Forderungen des ganzen
     * Stammes, nicht die eigenen. Sie haengt deshalb an genau dem Recht, das
     * auch die Seite "Offene Posten" der Kasse verlangt: `finance.view`. Wer
     * es nicht hat, bekommt die Zahlen gar nicht erst geschickt.
     */
    const canSeeFinance = matchesPermission(event.locals.permissions ?? [], "finance.view");

    /**
     * Umfragen zaehlen grosszuegiger als die uebrigen Kacheln: `surveys.view`
     * kann auch gruppengebunden vorliegen, und wer nur fuer seine Meute
     * antworten darf, soll die offene Umfrage trotzdem auf der Startseite
     * sehen. Was er wirklich sieht, entscheidet `listSurveys` ueber die
     * Freigaben -- die Kachel raet nichts.
     */
    const surveyGroups = groupsWithPermission(event, "surveys.view");
    const surveyManage = groupsWithPermission(event, "surveys.manage");
    const canSeeSurveys = surveyGroups === null || surveyGroups.length > 0;

    const [
        members,
        groups,
        invoiceLists,
        ownOrders,
        upcomingEvents,
        fiscalYears,
        openSurveys
    ] = await Promise.all([
            getAllMembers(),
            getAllGroups(),
            Promise.all(memberIds.map((memberId) => computeOutstanding({ memberId }))),
            listOrdersForMembers(memberIds),
            canSeeEvents
                ? listEvents(
                      { id: event.locals.user?.id, memberIds },
                      {
                          manageAll: matchesPermission(
                              event.locals.permissions ?? [],
                              "events.manage"
                          ),
                          range: "upcoming",
                          limit: 5
                      }
                  )
                : Promise.resolve([]),
            canSeeFinance ? listFiscalYears() : Promise.resolve([]),
            canSeeSurveys
                ? listSurveys(
                      { id: event.locals.user?.id, memberIds },
                      {
                          manageAll: surveyManage === null,
                          manageGroups: surveyManage,
                          status: "published"
                      }
                  )
                : Promise.resolve([])
        ]);

    // Dieselbe Staffel wie in den Berichten und bei den offenen Posten der
    // Kasse: ueber alle nicht archivierten Geschaeftsjahre.
    const aging = canSeeFinance
        ? await agingReport({
              fiscalYearIds: fiscalYears
                  .filter((year) => year.status !== "archived")
                  .map((year) => year.id)
          })
        : null;

    /**
     * Zu jedem kommenden Termin: fehlt noch eine Rueckmeldung fuer eines der
     * verknuepften Mitglieder? Genau das ist der Grund, warum die Kachel
     * ueberhaupt auf dem Dashboard steht.
     */
    const eventResponseState = await Promise.all(
        upcomingEvents.map(async (entry) => {
            if (memberIds.length === 0) return { id: entry.id, open: 0 };
            const own = await getOwnResponses(entry.id, memberIds);
            return {
                id: entry.id,
                open: memberIds.filter((memberId) => !own.has(memberId)).length
            };
        })
    );

    const openByEvent = new Map(eventResponseState.map((entry) => [entry.id, entry.open]));

    const groupMap = new Map(groups.map((g) => [g.id, g]));

    const today = new Date();
    const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

    const upcoming: UpcomingBirthday[] = members
        .map((m) => {
            if (!m.birthday) return null;
            const birthDate = new Date(m.birthday);
            if (isNaN(birthDate.getTime())) return null;

            const thisYear = startOfToday.getUTCFullYear();
            const next = new Date(Date.UTC(thisYear, birthDate.getUTCMonth(), birthDate.getUTCDate()));
            if (next.getTime() < startOfToday.getTime()) {
                next.setUTCFullYear(thisYear + 1);
            }

            const diffMs = next.getTime() - startOfToday.getTime();
            const inDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            const age = next.getUTCFullYear() - birthDate.getUTCFullYear();

            const formatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

            const firstGroupId = (m.groups ?? [])[0];
            const group = groupMap.get(firstGroupId);
            let groupLabel = "-";
            if (group) {
                const type = group.type ? `${group.type.charAt(0).toUpperCase()}${group.type.slice(1)}` : "";
                groupLabel = `${type ? `${type} ` : ""}${group.name}`;
            }

            return {
                id: m.id,
                firstname: m.firstname,
                group: groupLabel,
                dateISO: next.toISOString(),
                dateLabel: formatter.format(next),
                age,
                inDays
            } satisfies UpcomingBirthday;
        })
        .filter(Boolean)
        .sort((a, b) => a!.inDays - b!.inDays)
        .slice(0, 3) as UpcomingBirthday[];

    // Offene Posten der eigenen Mitglieder, nach Faelligkeit sortiert.
    const openInvoices = invoiceLists
        .flat()
        .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date));

    // Bestellungen gelten als offen, solange sie weder storniert noch
    // gleichzeitig geliefert und bezahlt sind.
    const openOrders = ownOrders.filter(
        (order) => !order.cancelled && !(order.status === "delivered" && order.paymentStatus === "paid")
    );

    return {
        userName,
        aging,
        birthdays: upcoming,
        events: upcomingEvents.map((entry) => ({
            id: entry.id,
            title: entry.title,
            location: entry.location,
            startsAt: entry.startsAt.toISOString(),
            allDay: entry.allDay,
            cancelled: entry.status === "cancelled",
            /** Wie viele der eigenen Mitglieder noch nicht zurueckgemeldet haben. */
            openResponses: openByEvent.get(entry.id) ?? 0,
            /** Farbe des Termins -- dieselbe wie in Liste und Monatsraster. */
            color: entry.color
        })),
        /*
         * Nur laufende Umfragen: ein Entwurf ist nicht zu beantworten, und
         * eine geschlossene gehoert nicht mehr auf die Startseite. Die Frist
         * wird hier geprueft, weil `listSurveys` sie bewusst nicht filtert --
         * die Uebersicht zeigt auch abgelaufene an.
         */
        surveys: openSurveys
            .filter((entry) => !entry.closesAt || entry.closesAt.getTime() > Date.now())
            .filter((entry) => !entry.opensAt || entry.opensAt.getTime() <= Date.now())
            .slice(0, 5)
            .map((entry) => ({
                id: entry.id,
                title: entry.title,
                closesAt: entry.closesAt?.toISOString() ?? null,
                responseCount: entry.responseCount
            })),
        hasLinkedMembers: memberIds.length > 0,
        outstandingTotal: sumCents(openInvoices.map((invoice) => invoice.outstanding)),
        outstandingCount: openInvoices.length,
        overdueCount: openInvoices.filter((invoice) => invoice.overdue).length,
        invoices: openInvoices.slice(0, 5).map((invoice) => ({
            id: invoice.id,
            member: invoice.member,
            kind: invoice.kind,
            outstanding: invoice.outstanding,
            dueDate: invoice.dueDate,
            overdue: invoice.overdue
        })),
        openOrderCount: openOrders.length,
        orders: openOrders.slice(0, 5).map((order) => ({
            id: order.id,
            number: order.number,
            createdAt: order.createdAt,
            total: order.total,
            status: order.status,
            paymentStatus: order.paymentStatus,
            itemCount: order.items.length
        }))
    };
};
