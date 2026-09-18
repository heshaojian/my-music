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
const REMOTE_SOURCE_PATTERN = /["']?\bsrcUrl\b["']?\s*:/iu;
const CREDENTIAL_LITERAL_PATTERN =
    /(?:["']?(?:cookie|(?:[a-z0-9_-]*_)?token|password|secret|api[_-]?key|authorization)["']?)\s*[:=]\s*(["'`])(.*?)\1/giu;

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

function hasCredentialInUrl(url: URL) {
    if (url.username || url.password) {
        return true;
    }
    for (const [key, value] of url.searchParams) {
        if (
            value.length > 0 &&
            /^(?:cookie|(?:[a-z0-9_-]*_)?token|password|secret|api[_-]?key|authorization)$/iu
                .test(key)
        ) {
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
    if (urlLiterals.some(literal => literal.toLowerCase().startsWith("http://"))) {
        reasons.push("plaintext-http");
    }
    let embeddedCredential = hasEmbeddedCredential(
        source,
        allowedAnonymousLiterals,
    );
    if (embeddedCredential) {
        reasons.push("embedded-credential");
    }

    const unapprovedHosts = new Set<string>();
    for (const literal of urlLiterals) {
        try {
            const parsedUrl = new URL(literal);
            const hostname = parsedUrl.hostname;
            embeddedCredential = embeddedCredential || hasCredentialInUrl(parsedUrl);
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
