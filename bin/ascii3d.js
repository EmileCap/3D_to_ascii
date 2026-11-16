#!/usr/bin/env node
import {runCli} from "../src/main/cli.js";runCli(process.argv.slice(2)).then(code=>process.exit(code)).catch(e=>{console.error(`ascii3d: ${e.message}`);process.exit(1)});
