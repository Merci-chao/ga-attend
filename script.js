// ==UserScript==
// @name         出勤紀錄
// @version      2025-12-14
// @updateURL    https://raw.githubusercontent.com/Merci-chao/ga-attend/refs/heads/main/script.js
// @downloadURL  https://raw.githubusercontent.com/Merci-chao/ga-attend/refs/heads/main/script.js
// @run-at       document-start
// @match        https://ga.gov.mo/macao-ga-extranet-attend-fe/
// @match        https://entity-account.safp.gov.mo/zh-hant/login
// @icon         https://ga.gov.mo/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(async () => {
let $ = (s,e) => (e || document).querySelector?.(s);
let $$ = (s,e) => [...(e || document).querySelectorAll?.(s)];
let pad = n => (n + "").padStart(2,0);
let m = unsafeWindow.m = s=>(s[0]=="-"?-1:1)*((s=s.replace("-","").split(":"))[0]*60+ +s[1]);
let s = unsafeWindow.s = (m,t)=>isNaN(m)?m:`${(m?m>0?t?"":"+":"-":"")}${pad((m=Math.abs(m))/60|0)}:${pad(m%60)}`;
let color = n=>!n?"zero":n>0?"positive":"negative";
let {min, max} = Math;
let now = new Date();

switch (location.href) {
	case "https://entity-account.safp.gov.mo/zh-hant/login":
		if (GM_getValue("attendPageLogouted")) {
			GM_deleteValue("attendPageLogouted");
			let i = setInterval(() => {
				let submit = $("#form [type=submit]");
				if (submit && $$("#username, #set_password").every(v => v.value)) {
					submit.click();
					clearInterval(i);
				}
			}, 50);
			addEventListener("focus", e => {
				if (e.target.matches?.("#set_password"))
					clearInterval(i);
			}, true);
		}
		return;
	case "https://ga.gov.mo/macao-ga-extranet-attend-fe/#/index":
	case "https://ga.gov.mo/macao-ga-extranet-attend-fe/#/403":
		location.href = "#/AttendPage?lang=zh-MO";
		location.reload();
		return;
}

//if (false)
addEventListener("visibilitychange", e => {
	if (document.visibilityState == "visible") {
		let table = $(".step_third_table");
		if (!table) return;
		table.style.height = table.getBoundingClientRect().height + "px";
		table.scrollLeft = 0;
		document.documentElement.scrollTop = 0;
		let tbody = $(".vxe-table--body tbody", table);
		let {innerHTML} = tbody;
		$(".refresh-btn").click();
		table.classList.add("reloading", "placingFakeRows");
		tbody.innerHTML = innerHTML;
		[...tbody.children].forEach(r => r.classList.add("fakeRow"));
	}
}, true);

unsafeWindow.reCal = () => {
	let todayStr = `${pad(now.getMonth()+1)}-${pad(now.getDate())}（${new Intl.DateTimeFormat("zh", {weekday: "narrow"}).format(now)}）`;

	$$(".cal").forEach(e => e.remove());

	let hasWorkingDays, today, todayWorking;
	let cells = $$(".time-tags").slice(1,6).reverse().map((cell, day) => {
		let halfOff = false;
		let timeTags = $$("div.time-tag", cell).filter(v => !v.textContent.includes("除夕") || !(halfOff = true));
		let workTime = m(day ? "7:15" : "7:00");
		let explainedTimes = timeTags.flatMap(t => ($("[role=tooltip]", t.closest("span.time-tag")).textContent.match(/^\s*(\d+:\d+)\s*—\s*(\d+:\d+)\s*$/) || []).slice(1).map(m));
		let payback = timeTags.flatMap(c => (c.textContent.trim().match(/^-\d+h\d+m$/) || []).map(v => m(v.replace(/m/, "").replace(/h/, ":")))).reduce((a,b)=>a+b,0);
		let times = timeTags.flatMap(c => (c.textContent.trim().match(/^\+?\d+:\d+$/) || []).map(m));
		times = [...times.filter(v => !explainedTimes.includes(v)), ...explainedTimes.filter(v => !times.includes(v))].sort((a,b)=>a-b);
		return {
			cell,
			row: cell.closest("tr"),
			times,
			offTime:  m(halfOff ? "13:00" : day ? "17:45" : "17:30"),
			minOffTime: m(halfOff ? "13:00" : "17:00"),
			maxOffTime: m(halfOff ? "13:30" : "19:00"),
			workTime,
			halfOff,
			payback,
			explainedTimes,
			maxExtra: halfOff ? m("1:00") : m("9:00") - workTime,
			lastWorkingDay: !hasWorkingDays && !timeTags.find(t => $("[role=tooltip]", t.closest("span.time-tag")).textContent.match(/\d+-\d+\s*—\s*\d+-\d+/)) && (hasWorkingDays = true),
		}
	});
	console.log(cells);

	cells.forEach((obj, day) => {
		let {row, times, offTime, maxExtra, halfOff, payback} = obj;
		if (!times.length)
			return;

		let working;
		if (!today && ($(".col_2", row).textContent.trim() == todayStr || row.matches(".today"))) {
			today = obj;
			if (working = times.length % 2 || times.at(-1) < obj.minOffTime)
				todayWorking = true;
		}

		let morning = times.filter(t => t < m("13:00"));
		let noon = times.filter(t => m("13:00") <= t && t <= m("15:00"));
		let afternoon = times.filter(t => t > m("15:00"));
		let time = 0;

		if (morning.length) {
			if (!(morning.length % 2))
				noon.shift();
			if (noon.length > 2 && noon.length % 2)
				noon.pop();

			if (noon.length < 2)
				time = noon[0] - m("13:00") || 0;
			else {
				let ranges = [];
				for (let i = 0; i < noon.length; i += 2)
					ranges.push(noon[i + 1] - noon[i]);
				ranges.sort((a,b)=>b-a).forEach((r, i) => {
					if (!i)
						time = m("1:30") - max(r, m("1:00"));
					else
						time -= r;
				});
			}
		} else if (noon.length)
			time = m("14:30") - noon[0];

		time = min(30, time);

		morning.filter(t => t <= m("10:00")).slice(0,1).forEach(t => time += m("9:00") - max(t, m("8:30")));

		if (!working)
			afternoon.filter(t => m("17:00") <= t).slice(-1).forEach(t => time += min(t, m("19:00")) - offTime);

		obj.bal = time = min(maxExtra, time) + payback;

		let balCell = $(".col_5", row);
		let balText = $(".vxe-cell", balCell).textContent.trim().replace("h", ":").replace("m", "");
		let bal = m(balText) - obj.workTime;
		let tempBalText = s(time);

		balText = s(bal);

		$(".col_4", row).insertAdjacentHTML("beforeend", `<div class="cal tempDailyBal temp ${color(time)}">${tempBalText}</div>`);
		let tempBalElt = $(".tempDailyBal", row);

		let diff = balText != tempBalText;

		if (!working) {
			if (diff)
				tempBalElt.classList.add("error");
			balCell.insertAdjacentHTML("beforeend", `<div class="cal dailyBal ${color(bal)}" ${working ? "hidden" : ""}>${balText}</div>`);
		}
	});

	let sum = type => $$(type).map(e => m(e.textContent)).reduce((a,b)=>a+b,0);
	let totalBal = sum(".dailyBal");
	let tempTotalBal = sum(".tempDailyBal");

	if (todayWorking) {
		let {bal, offTime, minOffTime, maxOffTime, maxExtra, cell, row, lastWorkingDay} = today;
		let maxEarlyTime = min(bal + m("1:00"), offTime - minOffTime, tempTotalBal);
		maxEarlyTime = max(maxEarlyTime, offTime - maxOffTime, bal - maxExtra);
		let suggestedOffTime = offTime - maxEarlyTime;

		let minus1HrOff = lastWorkingDay ? suggestedOffTime : max(offTime - bal - m("1:00"), minOffTime);

		tempTotalBal -= maxEarlyTime;
		$(".addBox1, .addBox", cell).insertAdjacentHTML("beforebegin", `<span class="cal"><b class="suggestedOffTime temp ${color(maxEarlyTime)} ${$(".tempDailyBal.error") ? "error" : ""}">${s(suggestedOffTime, true)}</b> <b class="minOffTime">(<u>${s(minus1HrOff, true)}</u>)</b></span>`);
		let balCell = $(".tempDailyBal", row);
		balCell.textContent = s(bal - maxEarlyTime);
		balCell.classList.remove("negative","positive","zero");
		balCell.classList.add(color(bal - maxEarlyTime));
	}

	if (cells.some(obj => obj.times.length)) {
		let summaryRow = $(".vxe-body--row:last-child");
		$(".col_5", summaryRow).insertAdjacentHTML("beforeend", `<div class="cal totalBal ${color(totalBal)}">${s(totalBal)}</div>`);
		$(".col_4", summaryRow).insertAdjacentHTML("beforeend", `<div class="cal tempTotalBal temp ${color(tempTotalBal)}">${s(tempTotalBal)}</div>`);
	}
};

let interval = setInterval(() => {
	let t = $(".step_third_table");
	if (!t) return;
	clearInterval(interval);
	$(".refresh-btn")?.addEventListener("click", e => {
		if (t.matches(".reloading"))
			location.reload();
	}, true);

	new MutationObserver(list => list.some(mutation => mutation.type == "childList" && [...mutation.addedNodes].some(node => {
		if (!$(".sums", node)) return;
		let table = $(".step_third_table");
		if (table.matches(".placingFakeRows")) {
			table.classList.remove("placingFakeRows");
			return;
		}
		$$(".fakeRow").forEach(r => r.remove());
		reCal();
		table.style.height = "";
		table.classList.remove("reloading");
		console.debug("table reload");
		healthCheck();
		return true;
	}))).observe(t, {childList: true, subtree: true});
	addStyle();
}, 50);

setInterval(() => {
	$$(".el-message-box").some(v => {
		let msg = $(".el-message-box__message", v).textContent;
		if (msg.includes("你的身份信息已被前一個瀏覽器頁簽裏的操作修改")) {
			$(".el-button", v).click();
			return true;
		} else if (msg.includes("你的會話已失效，請重新登錄")) {
			GM_setValue("attendPageLogouted", true);
			$(".el-button", v).click();
			return true;
		}
	});
}, 250);

let healthCheckDone;
function healthCheck() {
if (healthCheckDone)
	return;
healthCheckDone = true;
`
.refresh-btn
#iframeHeader
.head
.el-icon-arrow-left
.topBox
.users
.date-range-picker
.el-date-editor
.el-date-editor--daterange
.el-range-input
.el-input__icon
.attendance-top
.view-item
.view-label
.view-text
.im
.iBx
.table-box
.attendance-table .vxe-table
.body--wrapper
.vxe-table--header-border-line
.vxe-header--row
.vxe-body--row
.vxe-header--row .col_2 .no-conversion-dateTxt
.vxe-header--row .col_7
.vxe-body--column
.vxe-cell
.vxe-table--header
.vxe-table--body
.time-tags
.attendance-table .topBox .users .one
.attendance-table .topBox .users .back-week-btn
.right-box
.tBox
`.split("\n").forEach(v => (v = v.trim()) && !$(v) && console.error(`element not found: ${v}`));
console.error("health check done");
}

function addStyle() {
document.body.insertAdjacentHTML("beforeend", `<style>
.head {
	height: auto !important;
	padding: .5em 0 !important;
}

.cal {
	font-size: 1em;
	color: #575757;
}

.suggestedOffTime {
	line-height: 2.5;
	margin: 0 .3em;
	padding: .15em .25em;
}

.temp:not(.error) {
	outline: 2px dotted;
}

.minOffTime {
	color: red;
}

.suggestedOffTime,
.minOffTime {
	font-size: 1rem;
}

.positive {
	color: #00c000;
}

.negative {
	color: orangered;
}

.zero {
	color: orange;
}

.error {
	background: red;
	color: white;
}

.table-box {
	display: flex;
	flex-direction: column;
	padding: 0 !important;
}

.attendance-top,
.iBx {
	order: 2;
}

.step_third_table .vxe-table--body-wrapper {
	overflow: visible;
}

.step_third_table .vxe-body--column {
	border-block: 1px solid transparent;
}

.step_third_table.reloading :is(.vxe-table--empty-placeholder, .vxe-table--empty-block) {
	display: none !important;
}

.step_third_table.reloading .vxe-loading {
	display: block;
	background: none;
}

.attendance-table .vxe-body--row {
	height: 3.5rem !important;
}

.step_third_table {
	margin-bottom: 1em;
}

.step_third_table .vxe-table--border-line {
	display: none;
}

.iBx {
	margin-top: 2em;
	flex-direction: column;
}

.tBox {
	order: 2;
}

.topBox {
	margin: 0 !important;
	width: auto !important;
	height: auto !important;
}

.right-box,
.right-box li {
	gap: .5em;
}

.right-box :is(li, i) {
	margin: 0 !important;
}

.users :is(span, p) {
	font-size: .9rem !important;
}

.time-tags {
	gap: .75em;
}

.time-tag:is(.firstType, :has(.firstType)) {
	color: inherit !important;
	margin: 0 !important;
}

.dailyBal, .tempDailyBal,
.totalBal, .tempTotalBal {
	display: inline-block;
	padding: 0 .25em;
}

@media (orientation: portrait) {
	body {
		padding-top: 0 !important;
	}

	#iframeHeader {
		display: none !important;
	}

	.temp:not(.error) {
		outline: 1px dashed;
	}

	.head {
		padding: .1em 0 !important;

		span,
		p {
			font-size: 1rem !important
		}

		.el-icon-arrow-left + * {
			vertical-align: text-bottom;
		}
	}

	.step_third_table {
		overflow-x: auto;
		margin: 0;
	}

	.topBox {
		display: contents !important;

		.users {
			gap: .5em;
			place-content: center;

			.one {
				margin: 0 !important;
				gap: .5em;
			}

			:is(span, p) {
				font-size: .8rem !important;
			}
		}

		.date-range-picker {
			gap: .5em;
		}

		.el-date-editor {
			margin: 0 !important;
		}

		.el-date-editor--daterange {
			width: auto;
		}

		.el-range-input {
			font-size: .9rem !important;
			width: 6.5em;
		}

		.el-input__icon {
			display: none;
		}
	}

	.attendance-top {
		display: flex;
		flex-wrap: wrap;

		.view-item {
			margin-right: 0 !important;
			height: auto !important;
			padding: .5em !important;
			width: 50% !important;
			box-sizing: border-box;
			place-content: center;
			border-radius: 0 !important;

			.view-label,
			.view-text {
				width: auto !important;
				font-size: 1rem !important;
			}

			.im {
				margin: 0 .5rem;
			}

			.im,
			.im img {
				width: 1.5rem !important;
				height: 1.5rem !important;
			}
		}
	}

	.iBx {
		margin: 0;
	}

	.iBx > :last-child {
		overflow: auto;
		white-space: nowrap;
		width: 100%;
		padding: .5em 0;
		margin: 0 !important;
	}

	.table-box {
		gap: .5em;
	}

	.attendance-table .vxe-table {
		width: auto !important;
	}

	.step_third_table {
		tr, td, th {
			font-size: .95rem !important;
		}

		.body--wrapper {
			display: contents;
		}

		.vxe-table--header-border-line {
			display: none;
		}

		.vxe-header--row,
		.vxe-body--row {
			width: auto !important;
			height: auto !important;
			display: grid;
			column-gap: .5em;
			align-items: center;
			grid-template-columns: 3.5em 8.5em 5em 4em 6em;

			&:nth-last-child(even) {
				background: rgba(192, 192, 0, .1);
			}

			.vxe-cell--title {
				white-space: nowrap !important;
			}
		}

		.vxe-header--row .col_7 {
			display: none;
		}

		.vxe-body--column {
			height: auto !important;
			border: 0 !important;
			padding: .4em 0;
		}

		.vxe-cell {
			width: auto !important;
			overflow: visible !important;
			padding: 0 .5em;
		}

		.vxe-table--header,
		.vxe-table--body {
			width: auto !important;
		}

		.time-tags {
			padding: 0 !important;
			flex-wrap: wrap !important;
			width: auto !important;
			gap: .5em;

			.time-tag:is(.firstType, :has(.firstType)) {
				padding: 0 !important;
			}

			.time-tag, .cal {
				font-size: .9rem !important;
			}

			.time-tag:not(.fisrtType) {
				text-wrap: balance;
			}

			.time-tag.firstType {
				line-height: 1;
			}
		}

		.col_2 {
			width: 4em;

			.no-conversion-dateTxt {
				font-size: .7rem;
				white-space: normal;
				display: flex;
				line-height: 1.5;
				place-content: center;
			}
		}

		.col_3 {
			padding-right: 1rem;

			&:is(td) {
				display: flex;
				place-items:  center;
			}

			.vxe-cell {
				padding-left: 0;
			}
		}

		.suggestedOffTime,
		.dailyBal, .tempDailyBal,
		.totalBal, .tempTotalBal {
			padding: .15em .25em;
			line-height: 1.25;
			font-weight: normal;
		}

		.suggestedOffTime {
			margin-left: -.25em;
		}

		.suggestedOffTime,
		.minOffTime {
			font-size: inherit;
		}

		.col_7 {
			grid-column: 2 / 6;
			padding: 0;

			.vxe-cell {
				text-align: start;
				color: darkorange;
				font-weight: bold;
				white-space: normal !important;
			}
		}

		.addBox, .addBox1 {
			margin: 0 !important;
			position: absolute;
			right: 0;
			top: 50%;
			translate: 40% -50%;
		}
	}

	.attendance-table .topBox .users[class] {
		width: auto !important;

		.one {
			display: flex;
			max-width: none !important;
		}

		.back-week-btn {
			order: 2;
		}
	}

	.right-box {
		order: 2;
		width: auto !important;

		i {
			height: 2rem !important;
			width: 2rem !important;
			font-size: 1rem !important;
		}

		span {
			font-size: .7em !important;
		}
	}

	.tBox {
		flex-direction: column;
		height: auto !important;

		* {
			margin: 0;
		}
	}
}
</style>`);
}
})();
