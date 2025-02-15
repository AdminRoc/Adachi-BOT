import lodash from "lodash";
import fetch from "node-fetch";
import { imageOcr } from "#plugins/rating/data";
import { findIndexOf } from "#plugins/rating/findIndexOf";

async function doImageOcr(msg) {
  const source = msg.text.match(/\[CQ:image,type=.*?,file=.+?]/);
  const [url] = /(?<=url=).+(?=])/.exec(source) || [];

  return await imageOcr(msg, url);
}

// 使用可莉特调的 API 计算分数并发送
async function doRating(msg) {
  const headers = { "Content-Type": "application/json" };
  const prop = await doImageOcr(msg);
  let report, response, ret;

  if (undefined === prop) {
    return;
  }

  try {
    // { "total_score": 700.4420866489831, "total_percent": "77.83", "main_score": 0,
    //   "main_percent": "0.00", "sub_score": 700.4420866489831, "sub_percent": "77.83" }
    response = await fetch("https://api.genshin.pub/api/v1/relic/rate", {
      method: "POST",
      headers,
      body: JSON.stringify(prop),
    });

    ret = await response.json();
  } catch (e) {
    msg.bot.say(msg.sid, `圣遗物评分出错。`, msg.type, msg.uid, true);
    return;
  }

  if (400 === response.status) {
    if (lodash.hasIn(ret, "code") && 50003 === ret.code) {
      msg.bot.say(msg.sid, "您上传了正确的截图，但是 AI 未能识别，请重新截图。", msg.type, msg.uid, true);
    } else {
      msg.bot.say(msg.sid, `圣遗物评分出错。`, msg.type, msg.uid, true);
    }

    return;
  }

  if (200 === response.status || lodash.hasIn(ret, "total_percent")) {
    report = `您的${prop.pos || "圣遗物"}（${prop.main_item.name}）评分为 ${ret.total_percent} 分！\n==========`;
    prop.sub_item.forEach((item) => {
      report += `\n${item.name}：${item.value}`;
    });

    msg.bot.say(msg.sid, report, msg.type, msg.uid, false);
    return;
  }

  msg.bot.say(msg.sid, "发生了一个未知错误，请再试一次。", msg.type, msg.uid, true);
}

// 本地计算词条数并发送
async function doRating2(msg) {
  const prop = await doImageOcr(msg);
  let report;

  if (undefined === prop) {
    return;
  }

  report = `您的${prop.pos || "圣遗物"}（${prop.main_item.name}）词条数为：`;

  const effectTypes = lodash
    .chain(global.artifacts.props)
    .filter((c) => !["hp", "df"].includes(c.type))
    .map((c) => c.type)
    .uniq()
    .value();
  const cdcrTypes = ["cd", "cr"];
  const summary = {};
  let all = 0;
  let effect = 0;
  let cdcr = 0;

  for (const c of prop.sub_item) {
    const [index, percentage, numeric] = findIndexOf(c);

    if ("number" !== typeof index) {
      continue;
    }

    let nums = parseFloat(c.value) / (true === percentage ? 100 : 1) / global.artifacts.values[0][index];

    // 词条折算
    if (true === numeric) {
      switch (c.type) {
        case "hp":
          // 小生命，模型为珊瑚宫心海
          nums *= 298.75 / (13471 * 0.0583);
          break;
        case "df":
          // 小防御，模型为诺艾尔
          nums *= 23.15 / (799 * 0.0729);
          break;
        case "atk":
          // 小攻击，模型为狼末迪卢克
          nums *= 19.45 / ((335 + 608) * 0.0583);
          break;
      }
    }

    all += nums;

    if (effectTypes.includes(c.type)) {
      effect += nums;
    }

    if (cdcrTypes.includes(c.type)) {
      cdcr += nums;
    }

    if (undefined === summary[c.name]) {
      summary[c.name] = 0;
    }

    summary[c.name] += nums;
  }

  report += `\n全部词条：${all.toFixed(1)}`;

  if (effect > 0) {
    report += `\n有效词条：${effect.toFixed(1)}`;
  }

  if (cdcr > 0) {
    report += `\n暴击暴伤：${cdcr.toFixed(1)}`;
  }

  if (Object.keys(summary).length > 0) {
    report += `\n${"-".repeat(20)}`;
  }

  for (const [k, v] of Object.entries(summary)) {
    if (v > 0) {
      report += `\n${k}：${v.toFixed(1)}`;
    }
  }

  msg.bot.say(msg.sid, report, msg.type, msg.uid, false);
}

export { doRating, doRating2 };
