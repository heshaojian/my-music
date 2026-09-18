export interface CommunitySourcePolicy {
    readonly platform: string;
    readonly allowedHosts: readonly string[];
    readonly allowedAnonymousCredentialLiterals?: readonly string[];
}

const URL_LITERAL_PATTERN = /https?:\/\/[^\s"'`\\)\]}>,;]+/giu;
const DYNAMIC_CODE_PATTERNS = [
    /\beval\s*\(/u,
    /\bnew\s+Function\b/u,
    /\bFunction\s*\(/u,
] as const;
const PLAINTEXT_HTTP_SCHEME_PATTERN = /["'`]\s*http\s*:/iu;
const REMOTE_SOURCE_PATTERN = /["']?\bsrcUrl\b["']?\s*:/iu;
const CREDENTIAL_LITERAL_PATTERN =
    /(?:["']?(?:cookie|(?:[a-z0-9_-]*_)?token|password|secret|api[_-]?key|authorization)["']?)\s*[:=]\s*(["'`])(.*?)\1/giu;
const UIN_LITERAL_PATTERN =
    /["']?[a-z0-9_-]*uin["']?\s*[:=]\s*(?:(["'`])(.*?)\1|(\d+))/giu;

function normalizeAllowedHosts(hosts: readonly string[]) {
    return [...new Set(hosts.map(host => host.trim().toLowerCase()))]
        .filter(Boolean)
        .sort();
}

function isAllowedHost(hostname: string, allowedHosts: readonly string[]) {
    const normalizedHostname = hostname.toLowerCase();
    return allowedHosts.some(host =>
        normalizedHostname === host ||
        normalizedHostname.endsWith(`.${host}`));
}

function getUrlLiterals(source: string) {
    return source.match(URL_LITERAL_PATTERN) ?? [];
}

function hasEmbeddedCredential(
    source: string,
    allowedAnonymousLiterals: readonly string[],
) {
    for (const match of source.matchAll(CREDENTIAL_LITERAL_PATTERN)) {
        const literal = match[2];
        if (
            literal.length > 0 &&
            !allowedAnonymousLiterals.includes(literal)
        ) {
            return true;
        }
    }
    return false;
}

function hasNonAnonymousUinLiteral(source: string) {
    for (const match of source.matchAll(UIN_LITERAL_PATTERN)) {
        const literal = match[2] ?? match[3] ?? "";
        if (literal !== "" && literal !== "0") {
            return true;
        }
    }
    return false;
}

function decodeQueryPayload(value: string) {
    let decoded = value;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) {
                break;
            }
            decoded = next;
        } catch {
            break;
        }
    }
    return decoded;
}

function hasCredentialInUrl(
    url: URL,
    allowedAnonymousLiterals: readonly string[],
) {
    if (url.username || url.password) {
        return true;
    }
    for (const [key, value] of url.searchParams) {
        if (
            /uin$/iu.test(key) &&
            value !== "" &&
            value !== "0"
        ) {
            return true;
        }
        if (
            value.length > 0 &&
            /^(?:cookie|(?:[a-z0-9_-]*_)?token|password|secret|api[_-]?key|authorization)$/iu
                .test(key) &&
            !allowedAnonymousLiterals.includes(value)
        ) {
            return true;
        }
        if (hasNonAnonymousUinLiteral(decodeQueryPayload(value))) {
            return true;
        }
    }
    return false;
}

export function auditCommunityPluginSource(
    source: string,
    policy: CommunitySourcePolicy,
): readonly string[] {
    const allowedHosts = normalizeAllowedHosts(policy.allowedHosts);
    const allowedAnonymousLiterals = [
        ...new Set(policy.allowedAnonymousCredentialLiterals ?? []),
    ];
    const reasons: string[] = [];

    if (DYNAMIC_CODE_PATTERNS.some(pattern => pattern.test(source))) {
        reasons.push("dynamic-code-execution");
    }
    if (REMOTE_SOURCE_PATTERN.test(source)) {
        reasons.push("remote-source-url");
    }

    const urlLiterals = getUrlLiterals(source);
    if (
        PLAINTEXT_HTTP_SCHEME_PATTERN.test(source) ||
        urlLiterals.some(literal => literal.toLowerCase().startsWith("http://"))
    ) {
        reasons.push("plaintext-http");
    }
    let embeddedCredential = hasEmbeddedCredential(
        source,
        allowedAnonymousLiterals,
    ) || hasNonAnonymousUinLiteral(source);
    if (embeddedCredential) {
        reasons.push("embedded-credential");
    }

    const unapprovedHosts = new Set<string>();
    for (const literal of urlLiterals) {
        try {
            const parsedUrl = new URL(literal);
            const hostname = parsedUrl.hostname;
            embeddedCredential = embeddedCredential || hasCredentialInUrl(
                parsedUrl,
                allowedAnonymousLiterals,
            );
            if (!isAllowedHost(hostname, allowedHosts)) {
                unapprovedHosts.add(hostname.toLowerCase());
            }
        } catch {
            reasons.push("invalid-url-literal");
        }
    }
    reasons.push(...[...unapprovedHosts]
        .sort()
        .map(host => `unapproved-host:${host}`));

    if (embeddedCredential && !reasons.includes("embedded-credential")) {
        const firstHostIndex = reasons.findIndex(reason =>
            reason.startsWith("unapproved-host:"));
        reasons.splice(
            firstHostIndex === -1 ? reasons.length : firstHostIndex,
            0,
            "embedded-credential",
        );
    }

    return Object.freeze([...new Set(reasons)]);
}
