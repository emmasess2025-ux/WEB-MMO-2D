function renderTasksModal() {
    if (!tasksList) return;
    tasksList.innerHTML = "";

    if (activeTasksInterval) clearInterval(activeTasksInterval);

    const now = Date.now();

    for (let taskId in globalTasks) {
        const task = globalTasks[taskId];
        if (task.category !== currentTaskCategory) continue;

        const isRepeatable = task.isRepeatable || task.category === "daily";
        const cooldownMs = task.resetIntervalMs || 86400000; 

        let isClaimed = false;
        let lastClaimedTime = null;
        let timeRemainingMs = 0;

        if (Array.isArray(myClaimedTasks)) {
            isClaimed = myClaimedTasks.includes(taskId);
            if (isClaimed && isRepeatable) {
                timeRemainingMs = 1;
            }
        } else if (myClaimedTasks && typeof myClaimedTasks === "object") {
            if (myClaimedTasks[taskId]) {
                lastClaimedTime = Number(myClaimedTasks[taskId]);
                if (!isRepeatable) {
                    isClaimed = true;
                } else {
                    timeRemainingMs = (lastClaimedTime + cooldownMs) - now;
                    isClaimed = timeRemainingMs > 0;
                }
            }
        }

        let currentVal = 0;
        let lockedByAntiCheat = false;
        let antiCheatMsg = "";
        if (task.requirementType === "login") currentVal = 1;
        else if (task.requirementType === "kills") currentVal = player.kills;
        else if (task.requirementType === "elo") currentVal = player.elo;
        else if (task.requirementType === "play_hours") currentVal = myTaskProgress[taskId] || 0;
        else if (task.requirementType === "squad_base_minutes") {
            currentVal = (window.mySquadData && window.mySquadData.territoryTimeMinutes) ? window.mySquadData.territoryTimeMinutes : 0;
            if (window.mySquadData && window.mySquadData.members) {
                const isLeader = window.mySquadData.leader && window.mySquadData.leader.accountId === player.accountId;
                if (!isLeader) {
                    const memberInfo = window.mySquadData.members.find(m => m.accountId === player.accountId);
                    if (memberInfo && memberInfo.joinedAt) {
                        const joinedTime = new Date(memberInfo.joinedAt).getTime();
                        let milestoneDate = null;
                        if (window.mySquadData.milestonesAchieved && window.mySquadData.milestonesAchieved[taskId]) {
                            milestoneDate = new Date(window.mySquadData.milestonesAchieved[taskId]).getTime();
                        }

                        if (milestoneDate && joinedTime > milestoneDate) {
                            continue;
                        } else {
                            const daysInSquad = (Date.now() - joinedTime) / (1000 * 60 * 60 * 24);
                            if (daysInSquad < 15 && !milestoneDate) {
                                lockedByAntiCheat = true;
                                antiCheatMsg = `🔒 Disponible en ${Math.ceil(15 - daysInSquad)} días`;
                            }
                        }
                    }
                }
            }
        }

        const progressPercent = Math.min(100, Math.floor((currentVal / task.requirementValue) * 100));
        const canClaim = (currentVal >= task.requirementValue) && !isClaimed && !lockedByAntiCheat;

        const card = document.createElement("div");
        card.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 15px; display: flex; flex-direction: column; gap: 10px; transition: 0.3s;";

        if (isClaimed) {
            card.style.opacity = "0.5";
            card.style.filter = "grayscale(100%)";
            card.style.webkitFilter = "grayscale(100%)";
        }

        let rewardDisplay = "";
        if (task.rewardType === "coins") {
            rewardDisplay = `<span style="font-size: 16px; margin-right: 4px; vertical-align: middle;">💰</span> <span style="color: gold; font-weight: bold;">+${task.rewardValue}</span>`;
        } else if (task.rewardType === "bp_xp") {
            rewardDisplay = `<span style="font-size: 16px; margin-right: 4px; vertical-align: middle;">⭐</span> <span style="color: #00ffcc; font-weight: bold;">+${task.rewardValue} BP XP</span>`;
        } else {
            rewardDisplay = `<span style="color: #2ecc71; font-weight: bold;">Item: ${task.rewardValue}</span>`;
        }

        let btnHtml = "";
        if (isClaimed && isRepeatable) {
            if (lastClaimedTime) {
                const expireTime = lastClaimedTime + cooldownMs;
                btnHtml = `<button class="claim-btn task-timer" data-expire="${expireTime}" disabled style="background: transparent; color: #f1c40f; border: 1px solid #f1c40f; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: monospace; font-size: 14px; transition: 0.2s; margin-top: 5px; text-shadow: 1px 1px 0px black;">
                            ⏳ --:--:--
                        </button>`;
            } else {
                btnHtml = `<button class="claim-btn" disabled style="background: transparent; color: #f1c40f; border: 1px solid #f1c40f; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: monospace; font-size: 14px; transition: 0.2s; margin-top: 5px; text-shadow: 1px 1px 0px black;">
                            ⏳ En enfriamiento (Vuelve más tarde)
                        </button>`;
            }
        } else if (isClaimed && !isRepeatable) {
            btnHtml = `<button class="claim-btn" disabled style="background: #555; color: #888; border: none; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: sans-serif; transition: 0.2s; margin-top: 5px;">
                        CLAIMED
                    </button>`;
        } else if (lockedByAntiCheat) {
            btnHtml = `<button class="claim-btn" disabled style="background: transparent; color: #e74c3c; border: 1px solid #e74c3c; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: monospace; font-size: 14px; transition: 0.2s; margin-top: 5px; text-shadow: 1px 1px 0px black;">
                        ${antiCheatMsg}
                    </button>`;
        } else {
            btnHtml = `<button class="claim-btn" ${canClaim ? "" : "disabled"} style="background: ${canClaim ? "#2ecc71" : "#555"}; color: ${canClaim ? "black" : "#888"}; border: none; padding: 8px; border-radius: 5px; font-weight: bold; cursor: ${canClaim ? "pointer" : "not-allowed"}; font-family: sans-serif; transition: 0.2s; margin-top: 5px;">
                        CLAIM REWARD
                    </button>`;
        }

        card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="color: white; font-weight: bold; font-family: sans-serif; font-size: 14px;">${task.title}</div>
                            <div style="color: #aaa; font-family: sans-serif; font-size: 11px; margin-top: 4px;">${task.description}</div>
                        </div>
                        <div style="text-align: right; background: rgba(0,0,0,0.5); padding: 4px 8px; border-radius: 5px;">
                            ${rewardDisplay}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="flex-grow: 1; background: rgba(0,0,0,0.5); height: 8px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="background: ${canClaim ? "#2ecc71" : "#3498db"}; width: ${progressPercent}%; height: 100%; transition: width 0.3s;"></div>
                        </div>
                        <div style="color: white; font-size: 10px; font-weight: bold; min-width: 40px; text-align: right;">${Math.min(currentVal, task.requirementValue)} / ${task.requirementValue}</div>
                    </div>
                    ${btnHtml}
                `;

        if (canClaim) {
            const btn = card.querySelector(".claim-btn");
            btn.addEventListener("click", (e) => {
                e.target.innerText = "Procesando...";
                e.target.style.background = "#f1c40f";
                e.target.disabled = true;
                ws.send(MessagePack.encode({ type: "claim_task", taskId: taskId }));
            });
        }

        tasksList.appendChild(card);
    }

    if (activeTasksInterval) clearInterval(activeTasksInterval);
    activeTasksInterval = setInterval(updateTaskTimers, 1000);
    updateTaskTimers();
}

function updateTaskTimers() {
    const timers = document.querySelectorAll(".task-timer");
    const now = Date.now();

    timers.forEach(timerEl => {
        const expireTime = Number(timerEl.getAttribute("data-expire"));
        const diffMs = expireTime - now;

        if (diffMs <= 0) {
            renderTasksModal();
            if (typeof checkTaskBadge === "function") checkTaskBadge();
        } else {
            const totalSeconds = Math.floor(diffMs / 1000);
            const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
            const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
            const seconds = (totalSeconds % 60).toString().padStart(2, "0");
            timerEl.innerText = `⏳ Disponible en ${hours}:${minutes}:${seconds}`;
        }
    });
}

let bpActiveSeason = null;
let bpXP = 0;
let bpPremium = false;
let bpClaimedFree = [];
let bpClaimedPremium = [];

const bpBtn = document.getElementById("bp-btn");
const bpModal = document.getElementById("bp-modal");
const closeBpBtn = document.getElementById("close-bp-btn");
const buyPremiumBtn = document.getElementById("buy-premium-btn");
const bpTrackContainer = document.getElementById("bp-track-container");
const bpXpText = document.getElementById("bp-xp-text");
const bpXpBar = document.getElementById("bp-xp-bar");

if (bpBtn) {
    bpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openBattlePass();
    });
}
if (closeBpBtn) {
    closeBpBtn.addEventListener("click", () => {
        bpModal.style.display = "none";
        isTypingOrMenu = false;
    });
}
if (buyPremiumBtn) {
    buyPremiumBtn.addEventListener("click", () => {
        if (!bpActiveSeason) return;
        if (bpPremium) return alert("You already own the Premium Pass!");
        if (confirm(`Unlock Premium Pass for ${bpActiveSeason.costArgems} Argems?`)) {
            ws.send(MessagePack.encode({ type: "buy_premium_bp" }));
        }
    });
}

function openBattlePass() {
    if (!bpActiveSeason) {
        alert("Battle Pass is not active right now.");
        return;
    }
    isTypingOrMenu = true;
    bpModal.style.display = "flex";
    renderBattlePass();
}

function renderBattlePass() {
    if (!bpActiveSeason) return;
    document.getElementById("bp-title").innerText = bpActiveSeason.name;
    bpXpText.innerText = bpXP;
    
    if (bpPremium) {
        buyPremiumBtn.innerText = "PREMIUM UNLOCKED";
        buyPremiumBtn.style.background = "linear-gradient(90deg, #00ffcc, #0066ff)";
        buyPremiumBtn.disabled = true;
    }

    bpTrackContainer.innerHTML = "";
    
    const sortedRewards = [...bpActiveSeason.rewards].sort((a,b) => a.level - b.level);
    
    let currentLevel = 0;
    let nextXpReq = 0;

    sortedRewards.forEach((r, index) => {
        if (bpXP >= r.xpRequired) {
            currentLevel = r.level;
        }
        if (bpXP < r.xpRequired && nextXpReq === 0) {
            nextXpReq = r.xpRequired;
        }

        const col = document.createElement("div");
        col.style.display = "flex";
        col.style.flexDirection = "column";
        col.style.gap = "10px";
        col.style.minWidth = "120px";
        col.style.alignItems = "center";

        const title = document.createElement("div");
        title.innerText = `Lv ${r.level}`;
        title.style.fontSize = "12px";
        title.style.color = (bpXP >= r.xpRequired) ? "#00ffcc" : "#888";
        col.appendChild(title);

        const freeBox = createBpBox(r, "free");
        col.appendChild(freeBox);

        const premiumBox = createBpBox(r, "premium");
        col.appendChild(premiumBox);

        bpTrackContainer.appendChild(col);
    });

    if (nextXpReq > 0) {
        const prevReq = currentLevel > 0 ? sortedRewards.find(r=>r.level===currentLevel).xpRequired : 0;
        const progress = ((bpXP - prevReq) / (nextXpReq - prevReq)) * 100;
        bpXpBar.style.width = Math.min(100, progress) + "%";
        bpXpText.innerText = `${bpXP} / ${nextXpReq} XP`;
    } else {
        bpXpBar.style.width = "100%";
        bpXpText.innerText = `${bpXP} XP (MAX)`;
    }
}

function createBpBox(rewardObj, track) {
    const box = document.createElement("div");
    box.style.width = "100%";
    box.style.height = "120px";
    box.style.background = track === "premium" ? "rgba(255,204,0,0.1)" : "rgba(255,255,255,0.1)";
    box.style.border = track === "premium" ? "2px solid #ffcc00" : "2px solid #aaa";
    box.style.borderRadius = "8px";
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.justifyContent = "center";
    box.style.alignItems = "center";
    box.style.position = "relative";
    box.style.cursor = "pointer";

    const reward = track === "free" ? rewardObj.free : rewardObj.premium;
    const isUnlocked = bpXP >= rewardObj.xpRequired;
    const claimedArray = track === "free" ? bpClaimedFree : bpClaimedPremium;
    const isClaimed = claimedArray.includes(rewardObj.level);
    const lockedByPremium = track === "premium" && !bpPremium;

    if (!reward) {
        box.style.opacity = "0.3";
        return box;
    }

    if (!isUnlocked || lockedByPremium) {
        box.style.opacity = "0.5";
    }

    const icon = document.createElement("div");
    icon.style.fontSize = "30px";
    if (reward.type === "coins") icon.innerText = "💰";
    else if (reward.type === "argems") icon.innerText = "💎";
    else if (reward.type === "item") icon.innerText = "🎁";
    
    const label = document.createElement("div");
    label.style.fontSize = "10px";
    label.style.marginTop = "10px";
    label.innerText = reward.type === "item" ? reward.id : `${reward.amount} ${reward.type}`;

    box.appendChild(icon);
    box.appendChild(label);

    if (isClaimed) {
        const check = document.createElement("div");
        check.innerText = "✔️";
        check.style.position = "absolute";
        check.style.color = "#00ff00";
        check.style.fontSize = "40px";
        box.appendChild(check);
        box.style.opacity = "0.4";
    } else if (lockedByPremium) {
        const lock = document.createElement("div");
        lock.innerText = "🔒";
        lock.style.position = "absolute";
        lock.style.fontSize = "30px";
        box.appendChild(lock);
    } else if (isUnlocked) {
        box.style.boxShadow = "0 0 10px #00ffcc";
        box.addEventListener("click", () => {
            ws.send(MessagePack.encode({
                type: "claim_bp_reward",
                level: rewardObj.level,
                track: track
            }));
        });
    }

    return box;
}
