import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({testDir:'tests/browser',fullyParallel:false,workers:1,timeout:60000,use:{baseURL:'http://127.0.0.1:3000',headless:true,viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']},trace:'retain-on-failure'},reporter:'list',outputDir:'.local/browser-results'});
