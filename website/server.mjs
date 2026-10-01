import http from 'node:http';
import {readFile, appendFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {issueLicenseKey, mintDeliveryToken, verifyDeliveryToken} from './licensing.mjs';
import * as bulkAccounts from './bulk-accounts.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));