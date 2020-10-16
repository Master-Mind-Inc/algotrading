const { IncomingWebhook } = require("@slack/webhook");
const url = process.env.SLACK_WEBHOOK_URL;
const webhook = new IncomingWebhook(url);
module.exports.Send = async function (text){
    return await webhook.send({text});
}
