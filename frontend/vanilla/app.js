/* ============================================================
   AGENTSHIELD — FINAL FRONTEND
   ============================================================

   LIVE BACKEND:
   http://172.20.10.10:8000

   Backend:
       GET  /health
       GET  /providers
       POST /analyze
       POST /authorize
       GET  /transactions

   IMPORTANT:

   Reliability is NOT displayed anywhere.

   Zara's backend currently requires reliability in the
   request model, therefore it is sent internally.

   SECURITY RULE:

       APPROVE → x402 MAY EXECUTE
       REVIEW  → x402 MUST NOT EXECUTE
       BLOCK   → x402 MUST NOT EXECUTE
   ============================================================ */


/* ============================================================
   CONFIG
   ============================================================ */

const API_URL = "/svc/api";

const X402_PAYMENT_URL = "";


/* ============================================================
   APPLICATION STATE
   ============================================================ */

const state = {

    providers: [],

    currentProvider: null,

    currentAnalysis: null,

    currentAuthorization: null,

    transactions: [],

    backendOnline: false
};


/* ============================================================
   HELPERS
   ============================================================ */

function $(id) {

    return document.getElementById(id);
}


function setText(id, value) {

    const element = $(id);

    if (element) {

        element.textContent =
            value ?? "";
    }
}


function numberValue(
    value,
    fallback = 0
) {

    const n =
        Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function clamp(
    value,
    min = 0,
    max = 100
) {

    return Math.max(
        min,
        Math.min(
            max,
            numberValue(value)
        )
    );
}


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function normalizeDecision(value) {

    const decision =
        String(
            value ?? "REVIEW"
        )
        .toUpperCase()
        .trim();


    if (
        decision === "APPROVED"
    ) {

        return "APPROVE";
    }


    if (
        decision === "BLOCKED"
    ) {

        return "BLOCK";
    }


    return decision;
}


function riskFromDecision(
    decision
) {

    const normalized =
        normalizeDecision(
            decision
        );


    if (
        normalized === "APPROVE"
    ) {

        return "LOW";
    }


    if (
        normalized === "REVIEW"
    ) {

        return "MEDIUM";
    }


    if (
        normalized === "BLOCK"
    ) {

        return "HIGH";
    }


    return "UNKNOWN";
}


/* ============================================================
   NOTIFICATIONS
   ============================================================ */

function notify(
    title,
    message,
    type = "info"
) {

    console.log(
        `[AgentShield] ${title}: ${message}`
    );


    const notification =
        $("agentNotification");


    if (!notification) {

        return;
    }


    notification.innerHTML = `

        <strong>
            ${escapeHTML(title)}
        </strong>

        <span>
            ${escapeHTML(message)}
        </span>

    `;


    notification.classList.remove(
        "active",
        "success",
        "warning",
        "error"
    );


    if (
        type === "success"
    ) {

        notification.classList.add(
            "success"
        );
    }


    if (
        type === "warning"
    ) {

        notification.classList.add(
            "warning"
        );
    }


    if (
        type === "error"
    ) {

        notification.classList.add(
            "error"
        );
    }


    notification.classList.add(
        "active"
    );


    clearTimeout(
        notification._timer
    );


    notification._timer =
        setTimeout(
            () => {

                notification.classList.remove(
                    "active"
                );

            },
            3500
        );
}


/* ============================================================
   BACKEND HEALTH
   ============================================================ */

async function checkBackend() {

    try {

        const response =
            await fetch(
                `${API_URL}/health`
            );


        if (!response.ok) {

            throw new Error(
                `Backend returned ${response.status}`
            );
        }


        const data =
            await response.json();


        state.backendOnline =
            true;


        const status =
            $("systemStatus");


        if (status) {

            status.classList.remove(
                "offline"
            );

            status.classList.add(
                "online"
            );
        }


        console.log(
            "✓ AgentShield backend online",
            data
        );


        return data;


    } catch (error) {

        state.backendOnline =
            false;


        const status =
            $("systemStatus");


        if (status) {

            status.classList.remove(
                "online"
            );

            status.classList.add(
                "offline"
            );
        }


        console.error(
            "✕ Backend unavailable:",
            error
        );


        return null;
    }
}


/* ============================================================
   PROVIDER NORMALIZATION
   ============================================================ */

function normalizeProvider(
    raw,
    index
) {

    return {

        id:
            raw.id ??
            `provider-${index + 1}`,

        name:
            raw.name ??
            raw.service ??
            `Provider ${index + 1}`,

        description:
            raw.description ??
            "Digital service provider.",

        reputation:
            numberValue(
                raw.reputation
            ),

        /*
         * INTERNAL ONLY.
         *
         * Not displayed anywhere.
         */
        reliability:
            numberValue(
                raw.reliability
            ),

        successful_transactions:
            numberValue(
                raw.successful_transactions
            ),

        verified:
            Boolean(
                raw.verified
            ),

        price:
            numberValue(
                raw.price
            ),

        payment_protocol:
            raw.payment_protocol ??
            "x402"
    };
}


/* ============================================================
   PROVIDER DISCOVERY
   ============================================================ */

async function loadProviders() {

    try {

        const response =
            await fetch(
                `${API_URL}/providers`
            );


        if (!response.ok) {

            throw new Error(
                `Provider API returned ${response.status}`
            );
        }


        const data =
            await response.json();


        const rawProviders =
            Array.isArray(
                data.providers
            )
                ? data.providers
                : Array.isArray(data)
                    ? data
                    : [];


        state.providers =
            rawProviders.map(
                normalizeProvider
            );


        setText(
            "providerCount",
            state.providers.length
        );


        renderProviderCards();


        console.log(
            "✓ Providers loaded:",
            state.providers
        );


        return state.providers;


    } catch (error) {

        console.error(
            "Provider discovery failed:",
            error
        );


        notify(
            "Provider discovery failed",
            error.message,
            "error"
        );


        return [];
    }
}


/* ============================================================
   RENDER PROVIDERS
   ============================================================ */

function renderProviderCards() {

    const grid =
        $("serviceGrid");


    if (!grid) {

        return;
    }


    grid.innerHTML = "";


    state.providers.forEach(
        (provider, index) => {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "service-card";


            card.dataset.index =
                index;


            const verificationText =
                provider.verified
                    ? "✓ VERIFIED"
                    : "⚠ UNVERIFIED";


            const verificationClass =
                provider.verified
                    ? "verified"
                    : "verified unverified";


            card.innerHTML = `

                <div class="service-top">

                    <div class="service-icon">
                        ☁
                    </div>

                    <span class="${verificationClass}">
                        ${verificationText}
                    </span>

                </div>


                <h3>
                    ${escapeHTML(
                        provider.name
                    )}
                </h3>


                <p>
                    ${escapeHTML(
                        provider.description
                    )}
                </p>


                <div class="service-stats">


                    <div class="service-stat">

                        <span>
                            REPUTATION
                        </span>

                        <strong>
                            ${Math.round(
                                provider.reputation
                            )}/100
                        </strong>

                    </div>


                    <div class="service-stat">

                        <span>
                            TRANSACTIONS
                        </span>

                        <strong>
                            ${provider.successful_transactions}
                        </strong>

                    </div>


                    <div class="service-stat">

                        <span>
                            PRICE
                        </span>

                        <strong>
                            $${provider.price.toFixed(3)}
                        </strong>

                    </div>


                </div>


                <div class="service-actions">

                    <button
                        class="analyze-btn"
                        type="button"
                    >
                        Analyze Trust
                    </button>


                    <button
                        class="use-btn"
                        type="button"
                    >
                        Use Service
                    </button>

                </div>

            `;


            grid.appendChild(
                card
            );
        }
    );


    bindProviderButtons();
}


/* ============================================================
   ANALYZE
   ============================================================ */

async function analyzeProvider(
    provider
) {

    /*
     * Zara's backend requires:
     *
     * reputation
     * reliability
     * successful_transactions
     * verified
     * price
     *
     * Reliability is sent internally.
     * It is NOT shown in the UI.
     */

    const payload = {

        reputation:
            provider.reputation,

        reliability:
            provider.reliability,

        successful_transactions:
            provider.successful_transactions,

        verified:
            provider.verified,

        price:
            provider.price
    };


    console.log(
        "POST /analyze",
        payload
    );


    const response =
        await fetch(
            `${API_URL}/analyze`,
            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/json",

                    "Accept":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );


    if (!response.ok) {

        let detail = "";

        try {

            const error =
                await response.json();

            detail =
                error.detail
                    ? ` — ${JSON.stringify(error.detail)}`
                    : "";

        } catch (_) {}


        throw new Error(
            `Analysis failed: ${response.status}${detail}`
        );
    }


    const result =
        await response.json();


    return {

        ...result,

        trust_score:
            clamp(
                result.trust_score
            ),

        risk_level:
            String(
                result.risk_level ??
                riskFromDecision(
                    result.decision
                )
            ).toUpperCase(),

        decision:
            normalizeDecision(
                result.decision
            ),

        reputation:
            numberValue(
                result.reputation ??
                provider.reputation
            ),

        successful_transactions:
            numberValue(
                result.successful_transactions ??
                provider.successful_transactions
            ),

        verified:
            Boolean(
                result.verified ??
                provider.verified
            ),

        price:
            numberValue(
                result.price ??
                provider.price
            ),

        payment_protocol:
            result.payment_protocol ??
            "x402"
    };
}


/* ============================================================
   SHOW TRUST MODAL
   ============================================================ */

function showTrustModal(
    provider,
    result
) {

    state.currentProvider =
        provider;


    state.currentAnalysis =
        result;


    state.currentAuthorization =
        null;


    const decision =
        normalizeDecision(
            result.decision
        );


    const risk =
        String(
            result.risk_level ??
            riskFromDecision(
                decision
            )
        ).toUpperCase();


    /* Service */

    setText(
        "analysisService",
        provider.name
    );


    /* Score */

    setText(
        "analysisScore",
        result.trust_score
    );


    /* Risk */

    setText(
        "analysisRisk",
        `${risk} RISK`
    );


    const riskElement =
        $("analysisRisk");


    if (riskElement) {

        riskElement.classList.remove(
            "risk-low",
            "risk-medium",
            "risk-high"
        );


        if (
            risk === "LOW"
        ) {

            riskElement.classList.add(
                "risk-low"
            );

        } else if (
            risk === "MEDIUM"
        ) {

            riskElement.classList.add(
                "risk-medium"
            );

        } else if (
            risk === "HIGH"
        ) {

            riskElement.classList.add(
                "risk-high"
            );
        }
    }


    /* Reputation */

    const reputation =
        numberValue(
            result.reputation
        );


    setText(
        "analysisReputation",
        `${Math.round(
            reputation
        )}%`
    );


    updateBar(
        "reputationBar",
        reputation
    );


    /* Verification */

    const verified =
        Boolean(
            result.verified
        );


    setText(
        "analysisVerification",
        verified
            ? "VERIFIED"
            : "UNVERIFIED"
    );


    updateBar(
        "verificationBar",
        verified
            ? 100
            : 0
    );


    /* Price */

    const price =
        numberValue(
            result.price
        );


    setText(
        "analysisPrice",
        `$${price.toFixed(3)}`
    );


    let priceFairness =
        25;


    if (
        price <= 0.001
    ) {

        priceFairness =
            100;

    } else if (
        price <= 0.005
    ) {

        priceFairness =
            75;

    } else if (
        price <= 0.01
    ) {

        priceFairness =
            50;
    }


    updateBar(
        "priceBar",
        priceFairness
    );


    /* Transaction history */

    const transactions =
        numberValue(
            result.successful_transactions
        );


    setText(
        "analysisTransactions",
        transactions
    );


    updateBar(
        "transactionBar",
        Math.min(
            100,
            transactions / 2
        )
    );


    /* Decision */

    const decisionElement =
        $("analysisDecision");


    setText(
        "analysisDecision",
        decision
    );


    if (decisionElement) {

        decisionElement.classList.remove(
            "approved",
            "review",
            "blocked"
        );


        if (
            decision === "APPROVE"
        ) {

            decisionElement.classList.add(
                "approved"
            );

        } else if (
            decision === "REVIEW"
        ) {

            decisionElement.classList.add(
                "review"
            );

        } else {

            decisionElement.classList.add(
                "blocked"
            );
        }
    }


    /* x402 */

    setText(
        "paymentProtocol",
        result.payment_protocol ??
        "x402"
    );


    /* Payment button */

    updatePaymentButton(
        result
    );


    /* Open */

    const modal =
        $("trustModal");


    if (modal) {

        modal.classList.add(
            "active"
        );

        document.body.classList.add(
            "modal-open"
        );
    }
}


/* ============================================================
   PROGRESS BAR
   ============================================================ */

function updateBar(
    id,
    value
) {

    const element =
        $(id);


    if (!element) {

        return;
    }


    element.style.width =
        `${clamp(value)}%`;
}


/* ============================================================
   PROVIDER BUTTONS
   ============================================================ */

function bindProviderButtons() {

    document
        .querySelectorAll(
            ".service-card"
        )
        .forEach(
            card => {

                const index =
                    Number(
                        card.dataset.index
                    );


                const provider =
                    state.providers[
                        index
                    ];


                if (!provider) {

                    return;
                }


                /* --------------------------------------------
                   ANALYZE
                   -------------------------------------------- */

                const analyzeButton =
                    card.querySelector(
                        ".analyze-btn"
                    );


                if (analyzeButton) {

                    analyzeButton.onclick =
                        async () => {

                            const original =
                                analyzeButton.textContent;


                            analyzeButton.disabled =
                                true;


                            analyzeButton.textContent =
                                "Analyzing...";


                            try {

                                const result =
                                    await analyzeProvider(
                                        provider
                                    );


                                showTrustModal(
                                    provider,
                                    result
                                );


                                const decision =
                                    normalizeDecision(
                                        result.decision
                                    );


                                notify(
                                    "Trust analysis complete",
                                    `${provider.name}: ${result.trust_score}/100 — ${decision}`,
                                    decision === "APPROVE"
                                        ? "success"
                                        : decision === "BLOCK"
                                            ? "error"
                                            : "warning"
                                );


                            } catch (error) {

                                console.error(
                                    error
                                );


                                notify(
                                    "Analysis failed",
                                    error.message,
                                    "error"
                                );


                            } finally {

                                analyzeButton.disabled =
                                    false;

                                analyzeButton.textContent =
                                    original;
                            }
                        };
                }


                /* --------------------------------------------
                   USE SERVICE
                   -------------------------------------------- */

                const useButton =
                    card.querySelector(
                        ".use-btn"
                    );


                if (useButton) {

                    useButton.onclick =
                        async () => {

                            const original =
                                useButton.textContent;


                            useButton.disabled =
                                true;


                            useButton.textContent =
                                "Checking...";


                            try {

                                /*
                                 * First evaluate trust.
                                 */

                                const analysis =
                                    await analyzeProvider(
                                        provider
                                    );


                                showTrustModal(
                                    provider,
                                    analysis
                                );


                                /*
                                 * Then authorization.
                                 */

                                const authorization =
                                    await authorizeTransaction(
                                        provider,
                                        analysis
                                    );


                                state.currentAuthorization =
                                    authorization;


                                displayAuthorization(
                                    authorization
                                );


                                updatePaymentButton(
                                    authorization
                                );


                                const decision =
                                    normalizeDecision(
                                        authorization.decision
                                    );


                                notify(
                                    "Authorization evaluated",
                                    `${provider.name}: ${decision}`,
                                    decision === "APPROVE"
                                        ? "success"
                                        : decision === "BLOCK"
                                            ? "error"
                                            : "warning"
                                );


                            } catch (error) {

                                console.error(
                                    error
                                );


                                notify(
                                    "Authorization failed",
                                    error.message,
                                    "error"
                                );


                            } finally {

                                useButton.disabled =
                                    false;

                                useButton.textContent =
                                    original;
                            }
                        };
                }

            }
        );
}


/* ============================================================
   AUTHORIZE TRANSACTION
   ============================================================ */

async function authorizeTransaction(
    provider,
    analysis
) {

    /*
     * EXACT FastAPI contract:
     *
     * service
     * reputation
     * reliability
     * successful_transactions
     * verified
     * price
     * amount
     */

    const payload = {

        service:
            provider.name,

        reputation:
            numberValue(
                analysis.reputation ??
                provider.reputation
            ),

        /*
         * Internal backend requirement.
         * NOT DISPLAYED.
         */
        reliability:
            numberValue(
                provider.reliability
            ),

        successful_transactions:
            numberValue(
                analysis.successful_transactions ??
                provider.successful_transactions
            ),

        verified:
            Boolean(
                analysis.verified ??
                provider.verified
            ),

        price:
            numberValue(
                analysis.price ??
                provider.price
            ),

        amount:
            numberValue(
                provider.price
            )
    };


    console.log(
        "POST /authorize",
        payload
    );


    const response =
        await fetch(
            `${API_URL}/authorize`,
            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/json",

                    "Accept":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );


    if (!response.ok) {

        let detail = "";

        try {

            const error =
                await response.json();

            detail =
                error.detail
                    ? ` — ${JSON.stringify(error.detail)}`
                    : "";

        } catch (_) {}


        throw new Error(
            `Authorization failed: ${response.status}${detail}`
        );
    }


    const result =
        await response.json();


    return {

        ...result,

        decision:
            normalizeDecision(
                result.decision
            ),

        authorized:
            Boolean(
                result.authorized
            ),

        trust_score:
            numberValue(
                result.trust_score
            ),

        risk_level:
            String(
                result.risk_level ??
                riskFromDecision(
                    result.decision
                )
            ).toUpperCase(),

        reason:
            result.reason ??
            "AgentShield authorization policy evaluated the transaction.",

        amount:
            numberValue(
                result.amount ??
                provider.price
            ),

        payment_protocol:
            result.payment_protocol ??
            "x402"
    };
}


/* ============================================================
   DISPLAY AUTHORIZATION
   ============================================================ */

function displayAuthorization(
    result
) {

    const container =
        $("authorizationResult");


    if (!container) {

        return;
    }


    const decision =
        normalizeDecision(
            result.decision
        );


    const score =
        numberValue(
            result.trust_score
        );


    const reason =
        escapeHTML(
            result.reason
        );


    if (
        decision === "APPROVE"
    ) {

        container.innerHTML = `

            <div class="authorization-success">

                <div class="auth-icon">
                    ✓
                </div>

                <strong>
                    TRANSACTION AUTHORIZED
                </strong>

                <div class="auth-details">

                    <span>
                        Trust:
                        <strong>
                            ${score}/100
                        </strong>
                    </span>

                    <span>
                        Decision:
                        <strong>
                            APPROVE
                        </strong>
                    </span>

                    <span>
                        Amount:
                        <strong>
                            $${numberValue(
                                result.amount
                            ).toFixed(3)}
                        </strong>
                    </span>

                </div>

                <p>
                    ${reason}
                </p>

                <div class="payment-ready">
                    🛡 Authorization passed.
                    x402 may execute.
                </div>

            </div>
        `;


        return;
    }


    if (
        decision === "REVIEW"
    ) {

        container.innerHTML = `

            <div class="authorization-review">

                <div class="auth-icon">
                    !
                </div>

                <strong>
                    TRANSACTION PAUSED
                </strong>

                <div class="auth-details">

                    <span>
                        Trust:
                        <strong>
                            ${score}/100
                        </strong>
                    </span>

                    <span>
                        Decision:
                        <strong>
                            REVIEW
                        </strong>
                    </span>

                </div>

                <p>
                    ${reason}
                </p>

                <div>
                    x402 payment has
                    <strong>
                        NOT
                    </strong>
                    been authorized.
                </div>

            </div>
        `;


        return;
    }


    /* BLOCK */

    container.innerHTML = `

        <div class="authorization-blocked">

            <div class="auth-icon">
                ×
            </div>

            <strong>
                TRANSACTION BLOCKED
            </strong>

            <div class="auth-details">

                <span>
                    Trust:
                    <strong>
                        ${score}/100
                    </strong>
                </span>

                <span>
                    Decision:
                    <strong>
                        BLOCK
                    </strong>
                </span>

            </div>

            <p>
                ${reason}
            </p>

            <div>
                🛡 Payment prevented by AgentShield.
                x402 was not called.
            </div>

        </div>
    `;
}


/* ============================================================
   PAYMENT BUTTON
   ============================================================ */

function updatePaymentButton(
    result
) {

    const button =
        $("proceedPaymentBtn");


    if (!button) {

        return;
    }


    const decision =
        normalizeDecision(
            result?.decision
        );


    button.classList.remove(
        "payment-approved",
        "payment-review",
        "payment-blocked"
    );


    /* APPROVE */

    if (
        decision === "APPROVE"
    ) {

        button.disabled =
            false;

        button.classList.add(
            "payment-approved"
        );

        button.textContent =
            "⚡ Proceed with x402 Payment";

        return;
    }


    /* REVIEW */

    if (
        decision === "REVIEW"
    ) {

        button.disabled =
            true;

        button.classList.add(
            "payment-review"
        );

        button.textContent =
            "⚠ Authorization Required";

        return;
    }


    /* BLOCK */

    button.disabled =
        true;

    button.classList.add(
        "payment-blocked"
    );

    button.textContent =
        "✕ Payment Blocked";
}


/* ============================================================
   x402 PAYMENT
   ============================================================ */

async function executeX402Payment(
    provider,
    authorization
) {

    /*
     * Absolute security boundary.
     */

    if (
        normalizeDecision(
            authorization.decision
        ) !== "APPROVE" ||
        authorization.authorized !== true
    ) {

        throw new Error(
            "Payment denied by AgentShield."
        );
    }


    /*
     * Riya's bridge is not connected yet.
     *
     * This does NOT claim payment success.
     */

    if (!X402_PAYMENT_URL) {

        return {

            success:
                false,

            status:
                "READY",

            message:
                "AgentShield approved the transaction. x402 execution bridge is not connected yet."
        };
    }


    const response =
        await fetch(
            X402_PAYMENT_URL,
            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({

                        provider:
                            provider.name,

                        amount:
                            provider.price,

                        trust_score:
                            authorization.trust_score
                    })
            }
        );


    if (!response.ok) {

        throw new Error(
            `x402 bridge returned ${response.status}`
        );
    }


    return await response.json();
}


/* ============================================================
   PAYMENT BUTTON HANDLER
   ============================================================ */

function setupPaymentButton() {

    const button =
        $("proceedPaymentBtn");


    if (!button) {

        return;
    }


    button.onclick =
        async () => {

            const provider =
                state.currentProvider;


            const analysis =
                state.currentAnalysis;


            if (
                !provider ||
                !analysis
            ) {

                notify(
                    "Trust analysis required",
                    "Analyze a provider first.",
                    "warning"
                );

                return;
            }


            button.disabled =
                true;


            button.textContent =
                "🛡 Re-checking Authorization...";


            try {

                /*
                 * Fresh authorization immediately
                 * before payment.
                 */

                const authorization =
                    await authorizeTransaction(
                        provider,
                        analysis
                    );


                state.currentAuthorization =
                    authorization;


                displayAuthorization(
                    authorization
                );


                /*
                 * NEVER call x402 for REVIEW/BLOCK.
                 */

                if (
                    normalizeDecision(
                        authorization.decision
                    ) !== "APPROVE" ||
                    authorization.authorized !== true
                ) {

                    updatePaymentButton(
                        authorization
                    );


                    notify(
                        "Payment prevented",
                        `AgentShield returned ${authorization.decision}. x402 was not called.`,
                        authorization.decision === "BLOCK"
                            ? "error"
                            : "warning"
                    );


                    return;
                }


                button.disabled =
                    true;


                button.textContent =
                    "⚡ Starting x402...";


                const payment =
                    await executeX402Payment(
                        provider,
                        authorization
                    );


                /*
                 * Bridge isn't connected.
                 */

                if (
                    payment.status ===
                        "READY"
                ) {

                    button.disabled =
                        false;

                    button.textContent =
                        "✓ x402 Authorization Ready";


                    notify(
                        "Transaction authorized",
                        "AgentShield approved payment. Riya's x402 bridge still needs to execute settlement.",
                        "success"
                    );


                    return;
                }


                /*
                 * REAL SUCCESS ONLY.
                 */

                if (
                    payment.success ===
                        true ||
                    payment.status ===
                        "SUCCESS"
                ) {

                    button.disabled =
                        false;

                    button.textContent =
                        "✓ Payment Complete";


                    notify(
                        "Payment completed",
                        "x402 returned a successful payment response.",
                        "success"
                    );


                    await loadTransactions();


                    return;
                }


                button.disabled =
                    false;


                button.textContent =
                    "Payment Response Received";


            } catch (error) {

                console.error(
                    "Payment error:",
                    error
                );


                button.disabled =
                    false;


                button.textContent =
                    "Retry Payment";


                notify(
                    "Payment failed",
                    error.message,
                    "error"
                );
            }
        };
}


/* ============================================================
   TRANSACTIONS
   ============================================================ */

async function loadTransactions() {

    try {

        const response =
            await fetch(
                `${API_URL}/transactions`
            );


        if (!response.ok) {

            throw new Error(
                `Transaction API returned ${response.status}`
            );
        }


        const data =
            await response.json();


        state.transactions =
            Array.isArray(
                data.transactions
            )
                ? data.transactions
                : [];


        renderTransactions();


        updateDashboard();


    } catch (error) {

        console.warn(
            "Transaction history unavailable:",
            error
        );
    }
}


/* ============================================================
   RENDER TRANSACTIONS
   ============================================================ */

function renderTransactions() {

    const list =
        $("transactionList");


    if (!list) {

        return;
    }


    if (
        !state.transactions.length
    ) {

        list.innerHTML = `

            <div class="empty-state">

                No transactions recorded yet.

            </div>

        `;

        return;
    }


    list.innerHTML = "";


    state.transactions
        .slice(0, 20)
        .forEach(
            transaction => {

                const decision =
                    normalizeDecision(
                        transaction.decision
                    );


                let status =
                    decision;


                if (
                    status === "APPROVE"
                ) {

                    status =
                        "APPROVED";
                }


                if (
                    status === "BLOCK"
                ) {

                    status =
                        "BLOCKED";
                }


                let cardClass =
                    "approved";


                let icon =
                    "✓";


                if (
                    status === "REVIEW"
                ) {

                    cardClass =
                        "review";

                    icon =
                        "!";
                }


                if (
                    status === "BLOCKED"
                ) {

                    cardClass =
                        "blocked";

                    icon =
                        "×";
                }


                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    `transaction-card ${cardClass}`;


                card.innerHTML = `

                    <div class="transaction-icon">

                        ${icon}

                    </div>


                    <div class="transaction-info">

                        <h3>
                            ${escapeHTML(
                                transaction.service ??
                                "Unknown Service"
                            )}
                        </h3>

                        <p>
                            ${escapeHTML(
                                transaction.payment_protocol ??
                                "x402"
                            )}
                        </p>

                    </div>


                    <div class="transaction-trust">

                        <strong>
                            ${numberValue(
                                transaction.trust_score
                            )}/100
                        </strong>

                        <span>
                            ${escapeHTML(
                                String(
                                    transaction.risk_level ??
                                    riskFromDecision(
                                        decision
                                    )
                                ).toUpperCase()
                            )} RISK
                        </span>

                    </div>


                    <div class="transaction-amount">

                        <strong>
                            $${numberValue(
                                transaction.amount
                            ).toFixed(3)}
                        </strong>

                        <span>
                            ${status}
                        </span>

                    </div>

                `;


                list.appendChild(
                    card
                );
            }
        );
}


/* ============================================================
   DASHBOARD
   ============================================================ */

function updateDashboard() {

    const transactions =
        state.transactions;


    let approved =
        0;

    let review =
        0;

    let blocked =
        0;


    transactions.forEach(
        transaction => {

            const decision =
                normalizeDecision(
                    transaction.decision
                );


            if (
                decision === "APPROVE"
            ) {

                approved++;

            } else if (
                decision === "REVIEW"
            ) {

                review++;

            } else if (
                decision === "BLOCK"
            ) {

                blocked++;
            }
        }
    );


    setText(
        "totalTransactions",
        transactions.length
    );


    setText(
        "approvedTransactions",
        approved
    );


    setText(
        "reviewTransactions",
        review
    );


    setText(
        "blockedTransactions",
        blocked
    );
}


/* ============================================================
   LAUNCH AGENT
   ============================================================ */

function setupLaunchButton() {

    const button =
        $("launchBtn");


    if (!button) {

        return;
    }


    button.onclick =
        async () => {

            const original =
                button.textContent;


            button.disabled =
                true;


            button.textContent =
                "Connecting...";


            const backend =
                await checkBackend();


            if (backend) {

                button.textContent =
                    "● Agent Online";


                notify(
                    "AgentShield online",
                    "Trust infrastructure connected successfully.",
                    "success"
                );

            } else {

                button.textContent =
                    "Backend Offline";


                notify(
                    "Backend unavailable",
                    "Check Zara's FastAPI server.",
                    "error"
                );
            }


            setTimeout(
                () => {

                    button.disabled =
                        false;

                },
                1300
            );
        };
}


/* ============================================================
   MODAL
   ============================================================ */

function setupModal() {

    const modal =
        $("trustModal");


    const close =
        $("closeTrustModal");


    if (close) {

        close.onclick =
            () => {

                modal.classList.remove(
                    "active"
                );

                document.body.classList.remove(
                    "modal-open"
                );
            };
    }


    if (modal) {

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    modal
                ) {

                    modal.classList.remove(
                        "active"
                    );

                    document.body.classList.remove(
                        "modal-open"
                    );
                }
            }
        );
    }


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Escape"
            ) {

                modal?.classList.remove(
                    "active"
                );

                document.body.classList.remove(
                    "modal-open"
                );
            }
        }
    );
}


/* ============================================================
   REFRESH
   ============================================================ */

function setupRefresh() {

    document
        .querySelectorAll(
            ".refresh-btn"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        button.disabled =
                            true;


                        button.textContent =
                            "Refreshing...";


                        await loadProviders();

                        await loadTransactions();


                        button.disabled =
                            false;


                        button.textContent =
                            "↻ Refresh";
                    };
            }
        );
}


/* ============================================================
   INITIALIZE
   ============================================================ */

async function initialize() {

    console.log(
        "===================================="
    );


    console.log(
        "🛡 AGENTSHIELD"
    );


    console.log(
        "Frontend: READY"
    );


    console.log(
        `Backend: ${API_URL}`
    );


    console.log(
        "Trust Engine: READY"
    );


    console.log(
        "Authorization Gate: READY"
    );


    console.log(
        "x402 Gate: READY"
    );


    console.log(
        "===================================="
    );


    setupLaunchButton();

    setupModal();

    setupPaymentButton();

    setupRefresh();


    const backend =
        await checkBackend();


    if (!backend) {

        notify(
            "Backend unavailable",
            "Zara's FastAPI backend could not be reached.",
            "error"
        );

        return;
    }


    await loadProviders();

    await loadTransactions();


    console.log(
        "✓ AgentShield initialization complete"
    );
}


/* ============================================================
   START
   ============================================================ */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initialize
    );

} else {

    initialize();
}
