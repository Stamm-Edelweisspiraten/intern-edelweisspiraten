import * as crypto from "node:crypto";

function generatePassword(length = 16) {
    return crypto.randomBytes(length).toString("base64").slice(0, length);
}