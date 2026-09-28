#!/usr/bin/env node
/**
 * scan-keys.js - scan files/folders (and optionally git history) for leaked secrets.
 * No dependencies. Node 16+.
 *
 * Usage:
 *   node scan-keys.js <file-or-dir> [more paths...]
 *   node scan-keys.js .                    # scan current project
 *   node scan-keys.js . --git-history      # also scan every commit's diff
 *   node scan-keys.js . --show             # print full secrets (default: redacted)
 *
 * Exit code: 0 = clean, 1 = findings, 2 = error
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const targets = args.filter((a) => !a.startsWith("--"));
const SHOW = flags.has("--show");
const HISTORY = flags.has("--git-history");

if (targets.length === 0 && !HISTORY) {
	console.error("Usage: node scan-keys.js <file-or-dir> [...] [--git-history] [--show]");
	process.exit(2);
}

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "coverage", "vendor"]);
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Detection rules. */
const RULES = [
	{
		name: "AWS Access Key ID",
		regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|A3T[A-Z0-9])[A-Z0-9]{16}\b/g,
	},
	{
		// 40-char base64-ish value assigned to something that looks like an AWS secret
		name: "AWS Secret Access Key",
		regex: /(?:aws)?_?secret_?(?:access)?_?key["'\s:=]{1,6}([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi,
		group: 1,
	},
	{
		name: "Generic 40-char base64 string (possible AWS secret)",
		regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
		entropyMin: 4.2,
		mustHaveMixed: true,
	},
	{ name: "GitHub Token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
	{ name: "GitHub Fine-grained Token", regex: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g },
	{ name: "Slack Token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
	{ name: "Stripe Secret Key", regex: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/g },
	{ name: "Google API Key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
	{ name: "Private Key Block", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g },
	{
		name: "Hardcoded credential assignment",
		regex: /\b(?:password|passwd|pwd|secret|api[_-]?key|token)\b["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
		group: 1,
		entropyMin: 3.0,
	},
];

function entropy(s) {
	const freq = {};
	for (const c of s) freq[c] = (freq[c] || 0) + 1;
	return -Object.values(freq).reduce((sum, n) => {
		const p = n / s.length;
		return sum + p * Math.log2(p);
	}, 0);
}

function redact(s) {
	if (SHOW || s.length <= 8) return s;
	return `${s.slice(0, 4)}${"*".repeat(Math.min(s.length - 8, 20))}${s.slice(-4)}`;
}

/** Scan a block of text; returns findings [{rule, line, match}] */
function scanText(text) {
	const findings = [];
	const lines = text.split(/\r?\n/);
	lines.forEach((line, i) => {
		const seen = new Set();
		for (const rule of RULES) {
			rule.regex.lastIndex = 0;
			let m;
			while ((m = rule.regex.exec(line)) !== null) {
				const value = rule.group ? m[rule.group] : m[0];
				if (!value || seen.has(value)) continue;
				if (rule.entropyMin && entropy(value) < rule.entropyMin) continue;
				if (rule.mustHaveMixed && !(/[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value))) continue;
				seen.add(value);
				findings.push({ rule: rule.name, line: i + 1, col: m.index + 1, match: value });
			}
		}
	});
	return findings;
}

function looksBinary(buf) {
	return buf.subarray(0, 8000).includes(0);
}

function* walk(p) {
	const stat = fs.statSync(p);
	if (stat.isFile()) return yield p;
	for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(p, entry.name));
		} else if (entry.isFile()) {
			yield path.join(p, entry.name);
		}
	}
}

let total = 0;
function report(where, findings) {
	for (const f of findings) {
		total++;
		console.log(`[${f.rule}] ${where}:${f.line}:${f.col}  ${redact(f.match)}`);
	}
}

// --- working tree scan ---
for (const target of targets) {
	if (!fs.existsSync(target)) {
		console.error(`Not found: ${target}`);
		process.exit(2);
	}
	for (const file of walk(target)) {
		try {
			if (fs.statSync(file).size > MAX_FILE_BYTES) {
				console.error(`Skipped (over ${MAX_FILE_BYTES / 1024 / 1024}MB): ${file}`);
				continue;
			}
			const buf = fs.readFileSync(file);
			if (looksBinary(buf)) {
				console.error(`Skipped (binary): ${file}`);
				continue;
			}
			report(file, scanText(buf.toString("utf8")));
		} catch (err) {
			console.error(`Skipped ${file}: ${err.message}`);
		}
	}
}

// --- git history scan (this is what GitHub push protection checks) ---
if (HISTORY) {
	try {
		const log = execFileSync("git", ["log", "-p", "--all", "--no-color", "--unified=0"], {
			encoding: "utf8",
			maxBuffer: 1024 * 1024 * 1024,
		});
		let commit = "?";
		let file = "?";
		const added = [];
		for (const line of log.split("\n")) {
			if (line.startsWith("commit ")) commit = line.slice(7, 14);
			else if (line.startsWith("+++ b/")) file = line.slice(6);
			else if (line.startsWith("+") && !line.startsWith("+++")) added.push({ commit, file, line: line.slice(1) });
		}
		const dedupe = new Set();
		for (const a of added) {
			for (const f of scanText(a.line)) {
				const key = `${a.commit}|${a.file}|${f.match}`;
				if (dedupe.has(key)) continue;
				dedupe.add(key);
				total++;
				console.log(`[${f.rule}] commit ${a.commit} ${a.file}  ${redact(f.match)}`);
			}
		}
	} catch (err) {
		console.error(`git history scan failed: ${err.message}`);
		process.exit(2);
	}
}

console.log(total === 0 ? "\nNo secrets found." : `\n${total} possible secret(s) found.`);
process.exit(total === 0 ? 0 : 1);
