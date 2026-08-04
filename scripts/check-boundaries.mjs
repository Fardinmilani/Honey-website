import { analyzeWorkspace, formatViolations } from '../tools/boundaries/checker.mjs';

const { violations } = await analyzeWorkspace(process.cwd());
console.log(formatViolations(violations));
if (violations.length > 0) process.exitCode = 1;
