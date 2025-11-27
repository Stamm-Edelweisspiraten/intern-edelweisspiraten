export function can(permissions: string[], permission: string): boolean {
    if (permissions.includes("*")) return true;

    const prefix = permission.split(".")[0];
    if (permissions.includes(prefix + ".*")) return true;

    return permissions.includes(permission);
}
