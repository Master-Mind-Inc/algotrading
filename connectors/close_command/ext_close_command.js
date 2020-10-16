var fs = require("fs");
const ORACLE_NAME = process.env.ORACLE_NAME;
const STRAT_ID = process.env.STRAT_ID;
const ACCOUNT_NAME = process.env.ACCOUNT_NAME;

const { ClickHouse } = require('clickhouse');
const clickhouse_close_cmd = new ClickHouse({
    url: process.env.CH_LOGS_URL,
    port: process.env.CH_LOGS_PORT,
    debug: false,
    basicAuth: {
        username: process.env.CH_LOGS_USER,
        password: process.env.CH_LOGS_PASSWORD,
    },
    isUseGzip: true,
    config: {
        session_timeout                         : 60,
        output_format_json_quote_64bit_integers : 0,
        enable_http_compression                 : 0
    }
});

module.exports.GetCloseCommand = async function(pos){
    return await get_close_command(pos);
}

async function get_close_command(pos){
    let to_close = 0;
    var query = fs.readFileSync(process.cwd()+'/queries/get_close_command.sql','utf-8');
    query = query.replace(/{oracle}/g, ORACLE_NAME).replace(/{strat_id}/g, STRAT_ID).replace(/{account}/g, ACCOUNT_NAME)
    .replace(/{cid}/g, `${pos.ref_cid}`);
    try {
        to_close = (await clickhouse_close_cmd.query(query).toPromise())[0].to_close;
    } catch (error) {}
    let ret = (to_close === 1);
    if (ret) pos.cause = 'EXT';
    return ret;
}
