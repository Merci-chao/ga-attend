// ==UserScript==
// @name         出勤紀錄
// @version      2025-04-10
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
let m = unsafeWindow.m = s=>(s[0]=="-"?-1:1)*((s=s.replace("-","").split(":"))[0]*60+ +s[1]);
let s = unsafeWindow.s = (m,t)=>isNaN(m)?m:`${(m?m>0?t?"":"+":"-":"")}${(((m=Math.abs(m))/60|0)+"").padStart(2,0)}:${((m%60)+"").padStart(2,0)}`;
let numColor = n=>!n?"zero":n>0?"positive":"negative";

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
		location = "#/AttendPage?lang=zh";
		location.reload();
		return;
}

document.addEventListener("visibilitychange", e => {
	if (document.visibilityState == "visible") {
		let table = $(".step_third_table");
		if (!table) return;
		table.style.height = table.getBoundingClientRect().height + "px";
		table.scrollLeft = 0;
		document.body.scrollTop = document.documentElement.scrollTop = 0;
		let tbody = $(".vxe-table--body tbody", table);
		let {innerHTML} = tbody;
		$(".newPage").click();
		table.classList.add("reloading", "placingFakeRows");
		tbody.innerHTML = innerHTML;
		[...tbody.children].forEach(r => r.classList.add("fakeRow"));
	}
}, true);

unsafeWindow.reCal = async () => {
	$$(".cal").forEach(e => e.remove());

	let hasWorkingDays, today, todayAbnormalNoon, todayWorking;
	let cells = $$(".time-tags").slice(1,6).reverse().map((cell, day) => {
		let halfOff = !!$$("div.time-tag", cell).find(v => v.textContent.includes("除夕"));
		let workTime = m(day ? "7:15" : "7:00");
		return {
			cell,
			times: $$("div.time-tag", cell).map(c => m(c.textContent.trim().match(/\d+:\d+|$/)[0])).filter(v => v),
			offTime:  m(halfOff ? "13:00" : day ? "17:45" : "17:30"),
			minOffTime: m(halfOff ? "13:00" : "17:00"),
			maxOffTime: m(halfOff ? "13:30" : "19:00"),
			workTime,
			maxExtra: halfOff ? m("1:00") : m("9:00") - workTime,
			lastWorkingDay: !hasWorkingDays && !$$("div.time-tag", cell).find(v => !v.textContent.trim().match(/\d+:\d+|除夕/)) && (hasWorkingDays = true),
		}
	});
	console.log(cells);
	let now = new Date();
	now = {month: now.getMonth() + 1, date: now.getDate(), day: new Intl.DateTimeFormat("zh", {weekday: "narrow"}).format(now)};
	cells.forEach((obj, day) => {
		let {cell, times, offTime, maxExtra} = obj;
		if (!times.length)
			return;

		if (!today) {
			let [, month, date, day] = $(".col_2", cell.closest("tr")).textContent.trim().match(/(\d+)-(\d+)（(.)）/);
			if (+month == now.month && +date == now.date && day == now.day)
				today = obj;
		}

		let time = 0;

		let morning = times.filter(t => t < m("13:00"));
		let noon = times.filter(t => m("13:00") <= t && t <= m("15:00"));

		noon.forEach((t, i) => {
			time += i || !morning.length && noon.length == 1 ? m("14:30") - t : t - m("13:00");
		});

		time = Math.min(30, time);

		times.filter(t => t <= m("10:00")).slice(0,1).forEach(t => time += m("9:00") - Math.max(t, m("8:30")));

		times.filter(t => m("17:00") <= t).slice(-1).forEach(t => time += Math.min(t, m("19:00")) - offTime);

		time = Math.min(maxExtra, time);

		obj.bal = time;

		let row = cell.closest("tr");
		let balCell = $(".col_5", row);
		let balText = $(".vxe-cell", balCell).textContent.trim().replace("h", ":").replace("m", "");
		let expectedBalText = s(time);
		let abnormalNoon = noon.length > 2;
		let working = obj == today && times.at(-1) < obj.minOffTime;
		let bal = m(balText) - obj.workTime;

		if (working)
			todayWorking = true;

		balText = s(bal);

		$(".col_4", row).insertAdjacentHTML("beforeend", `<div class="cal tempDailyBal temp ${numColor(time)}">${expectedBalText}</div>`);
		let tempBalElt = $(".tempDailyBal", row);

		let diff = balText != expectedBalText;

		if (abnormalNoon) {
			tempBalElt.classList.remove("negative","positive","zero");
			tempBalElt.textContent = working ? "異常午休" : balText;
			if (working) {
				tempBalElt.classList.add("error");
				todayAbnormalNoon = true;
			} else {
				diff = false;
				tempBalElt.classList.add(numColor(bal));
			}
		}

		if (!working) {
			if (diff)
				tempBalElt.classList.add("error");
			balCell.insertAdjacentHTML("beforeend", `<div class="cal dailyBal ${numColor(bal)}" ${working ? "hidden" : ""}>${balText}</div>`);
		}
	});

	let sum = type => $$(type).map(elt => m(elt.textContent)).reduce((a,b)=>a+b,0);
	let totalBal = sum(".dailyBal");
	let tempTotalBal = sum(".tempDailyBal");

	if (todayWorking && !todayAbnormalNoon) {
		let maxEarlyTime = Math.min(today.bal + m("1:00"), today.offTime - today.minOffTime, tempTotalBal);
		maxEarlyTime = Math.max(maxEarlyTime, today.offTime - today.maxOffTime, today.bal - today.maxExtra);

		let suggestedOffTime = today.offTime - maxEarlyTime;
		let minus1HrOff = today.lastWorkingDay ? suggestedOffTime : Math.max(today.offTime - today.bal - m("1:00"), today.minOffTime);

		tempTotalBal -= maxEarlyTime;
		$(".addBox1, .addBox", today.cell).insertAdjacentHTML("beforebegin", `<span class="cal"><b class="suggestedOffTime temp ${numColor(maxEarlyTime)}">${s(suggestedOffTime, true)}</b> <b class="minOffTime">(<u>${s(minus1HrOff, true)}</u>)</b></span>`);
		let row = today.cell.closest("tr");
		let balCell = $(".tempDailyBal", row);
		balCell.textContent = s(today.bal - maxEarlyTime);
		balCell.classList.remove("negative","positive","zero");
		balCell.hidden = false;
		balCell.classList.add(numColor(today.bal - maxEarlyTime));
	}

	let summaryRow = $(".vxe-body--row:last-child");
	$(".col_5", summaryRow).insertAdjacentHTML("beforeend", `<div class="cal totalBal ${numColor(totalBal)}">${s(totalBal)}</div>`);
	if (!todayAbnormalNoon) {
		$(".col_4", summaryRow).insertAdjacentHTML("beforeend", `<div class="cal tempTotalBal temp ${numColor(tempTotalBal)}">${s(tempTotalBal)}</div>`);
		//if (tempTotalBal == totalBal)
		//	$(".tempTotalBal").hidden = true;
	}
};

let interval = setInterval(() => {
	let t = $(".step_third_table");
	if (!t) return;
	clearInterval(interval);
	$(".newPage").addEventListener("click", e => {
		if (t.matches(".reloading"))
			location.reload();
	}, true);
	t.addEventListener("DOMNodeInserted", e => {
		if (!$(".sums", e.target)) return;
		let table = $(".step_third_table");
		if (table.matches(".placingFakeRows")) {
			table.classList.remove("placingFakeRows");
			return;
		}
		$$(".fakeRow").forEach(r => r.remove());
		reCal();
		table.style.height = "";
		table.classList.remove("reloading");
	}, true);
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

.tableBox {
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

.rightBox,
.rightBox li {
	gap: .5em;
}

.rightBox :is(li, i) {
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

	.tableBox {
		gap: .5em;
	}

	.attendance-table[data-v-9a361286] .vxe-table {
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

			.time-tag.firstType {
				line-height: 1;
			}
		}

		.col_2 {
			span {
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

	.attendance-table .topBox .users[data-v-9a361286] {
		width: auto !important;

		.one {
			display: flex;
			max-width: none !important;
		}

		.backWeek {
			order: 2;
		}
	}

	.rightBox {
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

	.suggestedOffTime,
	.minOffTime {
		font-size: inherit;
	}

	.suggestedOffTime {
		padding: 0 .15em;
		margin-left: -.15em;
		line-height: 1;
	}
}
</style>`);
})();
