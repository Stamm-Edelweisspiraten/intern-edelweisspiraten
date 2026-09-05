export const ALL_PERMISSIONS = [
    // -----------------------
    // Member
    // -----------------------
    "members.view",
    "members.create",
    "members.edit",
    "members.delete",
    "groupleader.members.view",
    "groupleader.members.edit",
    "groupleader.members.delete",
    "groupleader.members.log",
    "groupleader.members.invitepdf",
    "members.*",

    // -----------------------
    // Dashboard
    // -----------------------
    "dashboard.view",

    // -----------------------
    // Groups
    // -----------------------
    "groups.view",
    "groups.create",
    "groups.edit",
    "groups.delete",
    "groupleader.groups.view",
    "groupleader.groups.memberspdf",
    "groups.*",

    // -----------------------
    // User
    // -----------------------
    "user.view",
    "user.create",
    "user.edit",
    "user.delete",
    "user.impersonate",
    "user.mfa.reset",
    "user.*",

    // -----------------------
    // System / Settings
    // -----------------------
    "system.settings.view",
    "system.settings.update",
    "roles.manage",
    "system.*",

    // -----------------------
    // Admin
    // -----------------------
    "admin.view",
    "admin.*",

    // -----------------------
    // Kaemmerer
    // -----------------------
    "kaemmerer.access",
    "kaemmerer.order.create",
    "kaemmerer.order.view",
    "kaemmerer.order.cancel",
    "kaemmerer.orders.view",
    "kaemmerer.orders.manage",
    "kaemmerer.articles.manage",
    "kaemmerer.storage.manage",
    "kaemmerer.*",

    // -----------------------
    // Finanzen
    // -----------------------
    "finance.view",
    "finance.manage",
    "finance.export",
    "finance.close",
    "finance.*",

    // -----------------------
    // Test / Misc
    // -----------------------
    "*"
];
