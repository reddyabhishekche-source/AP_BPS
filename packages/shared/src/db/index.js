"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const knex_1 = __importDefault(require("knex"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../../.env') });
// Prevent timezone-related date shifts: return Postgres DATE (OID 1082) as "YYYY-MM-DD" string.
// This keeps API payloads stable across environments/timezones.
pg_1.types.setTypeParser(1082, (value) => value);
const db = (0, knex_1.default)({
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    searchPath: ['public'],
});
exports.default = db;
//# sourceMappingURL=index.js.map