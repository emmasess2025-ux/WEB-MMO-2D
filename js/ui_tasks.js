// =========================================================
// 🌟 SISTEMA DE LOGROS Y TAREAS (UI_TASKS)
// =========================================================
if (typeof globalTasks === 'undefined') {
    window.globalTasks = {};
    window.myTaskProgress = {};
    window.myClaimedTasks = {};
}

const tasksBtn = document.getElementById('tasks-btn');
const tasksModal = document.getElementById('tasks-modal');
const closeTasksBtn = document.getElementById('close-tasks-modal');
const tasksBadge = document.getElementById('tasks-badge');
const tasksList = document.getElementById('tasks-list');

let activeTasksInterval = null;
let currentTaskCategory = 'daily';

if (tasksBtn) {
    tasksBtn.addEventListener('click', () => {
        if (!player || !player.accountId) return alert("⚠️ You must log in to view achievements.");
        if (tasksModal) tasksModal.style.display = 'flex';
        renderTasksModal();
    });
}

if (closeTasksBtn) {
    closeTasksBtn.addEventListener('click', () => {
        if (tasksModal) tasksModal.style.display = 'none';
        if (activeTasksInterval) {
            clearInterval(activeTasksInterval);
            activeTasksInterval = null;
        }
    });
}

document.querySelectorAll('.task-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.task-tab-btn').forEach(b => {
            b.style.borderBottom = "2px solid transparent";
            b.style.opacity = "0.5";
        });
        e.target.style.borderBottom = "2px solid #2ecc71";
        e.target.style.opacity = "1";
        currentTaskCategory = e.target.getAttribute('data-category');
        renderTasksModal();
    });
});

function checkTaskBadge() {
    if (!tasksBadge) return;
    let hasUnclaimed = false;
    const now = Date.now();

    for (let taskId in globalTasks) {
        const task = globalTasks[taskId];

        let isClaimed = false;
        if (Array.isArray(myClaimedTasks)) {
            isClaimed = myClaimedTasks.includes(taskId);
        } else if (myClaimedTasks && typeof myClaimedTasks === 'object') {
            if (myClaimedTasks[taskId]) {
                const lastClaimedTime = Number(myClaimedTasks[taskId]);
                if (!task.isRepeatable) isClaimed = true;
                else isClaimed = (now - lastClaimedTime) < (task.resetIntervalMs || 86400000);
            }
        }

        if (isClaimed) continue;

        let completed = false;
        if (task.requirementType === 'login') completed = true;
        else if (task.requirementType === 'kills') completed = ((player && player.kills) >= task.requirementValue);
        else if (task.requirementType === 'elo') completed = ((player && player.elo) >= task.requirementValue);
        else if (task.requirementType === 'play_hours') completed = ((myTaskProgress[taskId] || 0) >= task.requirementValue);
        else if (task.requirementType === 'squad_base_minutes') {
            if (window.mySquadData && window.mySquadData.territoryTimeMinutes >= task.requirementValue) {
                const isLeader = window.mySquadData.leader && player && window.mySquadData.leader.accountId === player.accountId;
                let lockedByAntiCheat = false;
                if (!isLeader && window.mySquadData.members && player) {
                    const memberInfo = window.mySquadData.members.find(m => m.accountId === player.accountId);
                    if (memberInfo && memberInfo.joinedAt) {
                        const joinedTime = new Date(memberInfo.joinedAt).getTime();
                        let milestoneDate = null;
                        if (window.mySquadData.milestonesAchieved && window.mySquadData.milestonesAchieved[taskId]) {
                            milestoneDate = new Date(window.mySquadData.milestonesAchieved[taskId]).getTime();
                        }

                        if (milestoneDate && joinedTime > milestoneDate) {
                            lockedByAntiCheat = true;
                        } else {
                            const daysInSquad = (Date.now() - joinedTime) / (1000 * 60 * 60 * 24);
                            if (daysInSquad < 15 && !milestoneDate) {
                                lockedByAntiCheat = true;
                            }
                        }
                    }
                }
                completed = !lockedByAntiCheat;
            }
        }

        if (completed) {
            hasUnclaimed = true;
            break;
        }
    }

    tasksBadge.style.display = hasUnclaimed ? 'flex' : 'none';
}
window.checkTaskBadge = checkTaskBadge;

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
        else if (task.requirementType === "kills") currentVal = (player && player.kills) || 0;
        else if (task.requirementType === "elo") currentVal = (player && player.elo) || 0;
        else if (task.requirementType === "play_hours") currentVal = myTaskProgress[taskId] || 0;
        else if (task.requirementType === "squad_base_minutes") {
            currentVal = (window.mySquadData && window.mySquadData.territoryTimeMinutes) ? window.mySquadData.territoryTimeMinutes : 0;
            if (window.mySquadData && window.mySquadData.members && player) {
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
                                antiCheatMsg = `⏳ Disponible en ${Math.ceil(15 - daysInSquad)} días`;
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
            rewardDisplay = `<span style="font-size: 16px; margin-right: 4px; vertical-align: middle;">🪙</span> <span style="color: gold; font-weight: bold;">+${task.rewardValue}</span>`;
        } else if (task.rewardType === "bp_xp") {
            rewardDisplay = `<span style="font-size: 16px; margin-right: 4px; vertical-align: middle;">⭐</span> <span style="color: #00ffcc; font-weight: bold;">+${task.rewardValue} BP XP</span>`;
        } else {
            rewardDisplay = `<span style="color: #2ecc71; font-weight: bold;">Item: ${task.rewardValue}</span>`;
        }

        if (task.bpXpReward && task.rewardType !== "bp_xp") {
            rewardDisplay += ` | <span style="font-size: 14px; margin-left: 4px; vertical-align: middle;">⭐</span> <span style="color: #00ffcc; font-weight: bold;">+${task.bpXpReward} BP XP</span>`;
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
                if (typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: "claim_task", taskId: taskId }));
                }
            });
        }

        tasksList.appendChild(card);
    }

    if (activeTasksInterval) clearInterval(activeTasksInterval);
    activeTasksInterval = setInterval(updateTaskTimers, 1000);
    updateTaskTimers();
}
window.renderTasksModal = renderTasksModal;

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
window.updateTaskTimers = updateTaskTimers;
