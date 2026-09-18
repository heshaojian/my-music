#!/usr/bin/env node

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const UPSTREAM_COMMIT = "e88f5dea5ea7b2b60ccb3aae6823ca38ec71c5d0";
const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const POLICY_PATH = path.join(
    REPOSITORY_ROOT,
    "src/core/pluginManager/managed/community/communitySourcePolicy.ts",
);
const RAW_BASE_URL =
    `https://raw.githubusercontent.com/maotoumao/MusicFreePlugins/${UPSTREAM_COMMIT}`;
const MAX_SOURCE_BYTES = 1024 * 1024;

const PROVIDERS = Object.freeze([
    Object.freeze({
        key: "netease",
        platform: "网易云",
        upstreamPath: "dist/netease/index.js",
        upstreamSha256: "d7d2870acbcca6aaaff6e8d16853f1d3db8ff7342cc5a35cebbf79e20eceebce",
        version: "0.2.4-mymusic.1",
        outputName: "neteasePluginSource.ts",
        constantName: "NETEASE_MANAGED_PLUGIN",
        sourceConstantName: "NETEASE_PLUGIN_SOURCE",
        allowedHosts: Object.freeze(["music.163.com", "music.126.net"]),
    }),
    Object.freeze({
        key: "qq",
        platform: "QQ音乐",
        upstreamPath: "dist/qq/index.js",
        upstreamSha256: "983ec034fe343b3fba7d08defff2ee0f9f049291d93aa34bcf667b754fd4ca01",
        version: "0.2.3-mymusic.1",
        outputName: "qqPluginSource.ts",
        constantName: "QQ_MANAGED_PLUGIN",
        sourceConstantName: "QQ_PLUGIN_SOURCE",
        allowedHosts: Object.freeze(["y.qq.com", "gtimg.cn", "qqmusic.qq.com"]),
        allowedAnonymousCredentialLiterals: Object.freeze(["uin="]),
    }),
    Object.freeze({
        key: "kuwo",
        platform: "酷我",
        upstreamPath: "dist/kuwo/index.js",
        upstreamSha256: "aef76a4fe81fa8bea8eda709666eadd6fe99df5137383978719ac5f925310096",
        version: "0.1.8-mymusic.1",
        outputName: "kuwoPluginSource.ts",
        constantName: "KUWO_MANAGED_PLUGIN",
        sourceConstantName: "KUWO_PLUGIN_SOURCE",
        allowedHosts: Object.freeze(["kuwo.cn"]),
    }),
    Object.freeze({
        key: "migu",
        platform: "咪咕",
        upstreamPath: "dist/migu/index.js",
        upstreamSha256: "45a7d9be59b3fef7e2bc1c7fa2205a12b98776abf560dd5d287acb0b1103659f",
        version: "0.2.3-mymusic.1",
        outputName: "miguPluginSource.ts",
        constantName: "MIGU_MANAGED_PLUGIN",
        sourceConstantName: "MIGU_PLUGIN_SOURCE",
        allowedHosts: Object.freeze(["migu.cn"]),
    }),
    Object.freeze({
        key: "ximalaya",
        platform: "喜马拉雅",
        upstreamPath: "dist/xmly/index.js",
        upstreamSha256: "ab283d5544c4b40ee53ce9a984c3dcc3bfb39b7c66a443e2497cb6132de4cdce",
        version: "0.1.7-mymusic.1",
        outputName: "ximalayaPluginSource.ts",
        constantName: "XIMALAYA_MANAGED_PLUGIN",
        sourceConstantName: "XIMALAYA_PLUGIN_SOURCE",
        allowedHosts: Object.freeze(["ximalaya.com", "xmcdn.com"]),
    }),
]);

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function fetchPinnedSource(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: { "User-Agent": "MyMusic-community-plugin-vendor/1" },
            timeout: 30_000,
        }, response => {
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`Unexpected upstream response: ${response.statusCode}`));
                return;
            }
            const chunks = [];
            let byteLength = 0;
            response.on("data", chunk => {
                byteLength += chunk.length;
                if (byteLength > MAX_SOURCE_BYTES) {
                    request.destroy(new Error("Upstream source exceeds size limit"));
                    return;
                }
                chunks.push(chunk);
            });
            response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });
        request.on("timeout", () => request.destroy(new Error("Upstream request timed out")));
        request.on("error", reject);
    });
}

function loadSourcePolicy() {
    const policySource = fs.readFileSync(POLICY_PATH, "utf8");
    const compiled = ts.transpileModule(policySource, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: POLICY_PATH,
        reportDiagnostics: true,
    });
    const diagnostics = compiled.diagnostics ?? [];
    if (diagnostics.some(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)) {
        throw new Error("Community source policy could not be compiled");
    }
    const policyModule = { exports: {} };
    vm.runInNewContext(
        `(function(module, exports, URL, Object, Set) {${compiled.outputText}\n})`,
        Object.freeze({}),
        { filename: POLICY_PATH },
    )(policyModule, policyModule.exports, URL, Object, Set);
    return policyModule.exports.auditCommunityPluginSource;
}

function replaceExactlyOnce(source, pattern, replacement, label) {
    const matches = source.match(new RegExp(pattern.source, pattern.flags.includes("g")
        ? pattern.flags
        : `${pattern.flags}g`)) ?? [];
    if (matches.length !== 1) {
        throw new Error(`${label} expected one match, found ${matches.length}`);
    }
    return source.replace(pattern, replacement);
}

function transformCommonSource(source, provider) {
    const withoutSourceUrl = replaceExactlyOnce(
        source,
        /^\s*srcUrl:\s*["'][^"']+["'],\s*\r?\n/mu,
        "",
        `${provider.key} srcUrl`,
    );
    const exportIndex = withoutSourceUrl.lastIndexOf("module.exports = {");
    if (exportIndex < 0) {
        throw new Error(`${provider.key} is missing module.exports`);
    }
    const prefix = withoutSourceUrl.slice(0, exportIndex);
    const exported = withoutSourceUrl.slice(exportIndex);
    const versionedExport = replaceExactlyOnce(
        exported,
        /(\bversion:\s*)["'][^"']+["']/u,
        `$1"${provider.version}"`,
        `${provider.key} exported version`,
    );
    return `${prefix}${versionedExport}`;
}

function transformProviderSource(source, provider) {
    let transformed = transformCommonSource(source, provider);
    if (provider.key === "qq") {
        transformed = transformed
            .replaceAll("http://u.y.qq.com", "https://u.y.qq.com")
            .replaceAll("http://c.y.qq.com", "https://c.y.qq.com");
        transformed = replaceExactlyOnce(
            transformed,
            /result\.req_0\.data\.sip\.find\(\(i\) => !i\.startsWith\("http:\/\/ws"\)\) \|\|\s*result\.req_0\.data\.sip\[0\]/u,
            "result.req_0.data.sip[0]",
            "qq legacy media candidate selection",
        );
    } else if (provider.key === "kuwo") {
        transformed = transformed.replaceAll("http://", "https://");
    } else if (provider.key === "migu") {
        transformed = transformed
            .replaceAll('referer: "http://music.migu.cn"', 'referer: "https://music.migu.cn"')
            .replaceAll('referer: "http://m.music.migu.cn/v3"', 'referer: "https://m.music.migu.cn/v3"');
        transformed = replaceExactlyOnce(
            transformed,
            /^searchLyric\('夜曲', 1\)\.then\(console\.log\);\s*\r?\n/mu,
            "",
            "migu import-time network request",
        );
    }
    return transformed;
}

function createGeneratedModule(provider, source) {
    return `import type { ManagedPluginDescriptor } from "../../managedPluginLifecycle";\n\n` +
        `export const ${provider.sourceConstantName} = ${JSON.stringify(source)};\n\n` +
        `export const ${provider.constantName} = Object.freeze({\n` +
        `    platform: ${JSON.stringify(provider.platform)},\n` +
        `    version: ${JSON.stringify(provider.version)},\n` +
        `    source: ${provider.sourceConstantName},\n` +
        `}) satisfies ManagedPluginDescriptor;\n\n` +
        `export default ${provider.constantName};\n`;
}

async function buildAllOutputs() {
    const auditCommunityPluginSource = loadSourcePolicy();
    const outputs = [];
    for (const provider of PROVIDERS) {
        const upstreamUrl = `${RAW_BASE_URL}/${provider.upstreamPath}`;
        const upstreamSource = await fetchPinnedSource(upstreamUrl);
        const actualHash = sha256(upstreamSource);
        if (actualHash !== provider.upstreamSha256) {
            throw new Error(
                `${provider.key} upstream hash mismatch: expected ${provider.upstreamSha256}, received ${actualHash}`,
            );
        }
        const transformedSource = transformProviderSource(upstreamSource, provider);
        const reasons = auditCommunityPluginSource(transformedSource, {
            platform: provider.platform,
            allowedHosts: provider.allowedHosts,
            allowedAnonymousCredentialLiterals:
                provider.allowedAnonymousCredentialLiterals,
        });
        if (reasons.length > 0) {
            throw new Error(`${provider.key} source audit failed: ${reasons.join(", ")}`);
        }
        outputs.push(Object.freeze({
            outputPath: path.join(
                REPOSITORY_ROOT,
                "src/core/pluginManager/managed/community/sources",
                provider.outputName,
            ),
            content: createGeneratedModule(provider, transformedSource),
        }));
    }
    return Object.freeze(outputs);
}

function writeOutputsAtomically(outputs) {
    for (const output of outputs) {
        fs.mkdirSync(path.dirname(output.outputPath), { recursive: true });
        const temporaryPath = `${output.outputPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporaryPath, output.content, {
                encoding: "utf8",
                flag: "wx",
                mode: 0o600,
            });
            fs.renameSync(temporaryPath, output.outputPath);
        } finally {
            try {
                fs.unlinkSync(temporaryPath);
            } catch (error) {
                if (error.code !== "ENOENT") {
                    throw error;
                }
            }
        }
    }
}

async function main() {
    const outputs = await buildAllOutputs();
    writeOutputsAtomically(outputs);
    process.stdout.write(
        `Vendored ${outputs.length} community plugins from ${UPSTREAM_COMMIT}.\n`,
    );
}

main().catch(error => {
    process.stderr.write(`Community plugin vendor failed: ${error.message}\n`);
    process.exitCode = 1;
});
