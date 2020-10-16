const connectors = require('../connectors');
const math = require('../math');
const DEBUG = +(process.env.DEBUG || '0');
const exchange_raw = process.env.EXCHANGE.split('_');
const EXCHANGE = exchange_raw[0];
const EXEC_MODA = (exchange_raw.length > 1) ? exchange_raw[1] : 'MARKET';
const RECALCULATE_HISTORY = +(process.env.RECALCULATE_HISTORY || '');
const INTERNAL_RISK_MANAGER = +(process.env.INTERNAL_RISK_MANAGER || '');

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports.define = async function (){
    global.market_status = {OP: {}, type: 0, CHP: [{last_price: 0, type: 0, ufs: [{cid: 0, b_ts: 0, type: 0, moi: 0, close_ts: 1, filled: -1}]}]};
    global.chp_for_serial = [];
    global.logs = [];
    global.batch_ticks = {};

    global.trend_ticks_array = [];
    global.trend_ticks = {};

    global.batch_ticks_array = [];
    global.pre_logs = [];
    global.queue = [];
    global.pre_queue = [];
    global.sequence = 0;
    global.in_progress = 0xFFFF0000; // 0b11111111111111110000000000000000   ->   0b00000000000000001111111111111111   0x0000FFFF
    global.hard_stop_in_progress = 0xFFFF0000;
    global.pause = 0b0;
    global.ignore_logs = (EXEC_MODA !== 'MARKET');
    global.init_done = false;
    
    global.wallet = +(process.env.WALLET || '0');
    global.current_risk_money = 0;

    global.market = {orders: {}, loans: 0, sequence: 0, ts_start: 0, ts_end: 0, ticks: []};

    global.connectors = connectors;
    global.math = math;
    global.time_tracker = {};

    global.sw_obj = {sw:{}, cmds: []};

    let params_arr = (await connectors.db_logs.GetParams(process.env.ORACLE_NAME, process.env.STRAT_ID));
    if (params_arr.length === 0) {
        console.error('ERROR: STRAT PARAMS ARE EMPTY!');
        process.exit(1);
    }
    let params = params_arr[0];
    if (params.CLOSE_COMMAND === 'INTERNAL' && params.CLOSE_COMMAND_TIME === 0) {
        console.error('ERROR: If INTERNAL CLOSE_COMMAND is used, CLOSE_COMMAND_TIME should be defined!');
        process.exit(1);
    }
    if (params.ORACLE_ZERO === '') {
        console.error('ERROR: ORACLE_ZERO should be defined!');
        process.exit(1);
    }
    if (EXEC_MODA === 'PNL'){
        if (!global.gc) {
            console.error(`ERROR: Flag "--expose-gc" should be hired in PNL Mode!`);
            process.exit(1);
        }
    }
    let ranges = [[params.ranges[0][0]*1000, params.ranges[0][1]*1000]];
    for (let i = 1; i < params.ranges.length; i++) {
        let r = [params.ranges[i][0]*1000, params.ranges[i][1]*1000];
        let r_prev = ranges[ranges.length-1];
        if (r_prev[1] + params.p1*1000 >= r[0]) r_prev[1] = r[1];
        else ranges.push(r);
    }

    global.params = {
        p1: params.p1,
        p2: params.p2,
        p3: params.p3,
        p4: params.p4,
        p5: params.p5,
        p6: params.p6,
        p7: params.p7,
        p8: params.p8,
        p9: params.p9,
        p10: params.p10,
        ranges: ranges,
        env: {
            ACCURACY_FIELD                  : params.ACCURACY_FIELD || 'accuracy',
            ACCURACY_FILTER                 : +params.ACCURACY_FILTER,
            ACCURACY_LEVEL                  : +params.ACCURACY_LEVEL,
            DYNAMIC_SLTP_FIELD              : params.DYNAMIC_SLTP_FIELD || 'delta',
            DYNAMIC_SLTP_SL_COEFF           : +params.DYNAMIC_SLTP_SL_COEFF,
            DYNAMIC_SLTP_TP_COEFF           : +params.DYNAMIC_SLTP_TP_COEFF,
            DYNAMIC_SLTP                    : +params.DYNAMIC_SLTP,
            LEARN_DISTANCE_LIMIT_RED        : (+params.LEARN_DISTANCE_LIMIT_RED) ? +params.LEARN_DISTANCE_LIMIT_RED : Number.MAX_VALUE,
            LEARN_DISTANCE_LIMIT_GREEN      : (+params.LEARN_DISTANCE_LIMIT_GREEN) ? +params.LEARN_DISTANCE_LIMIT_GREEN : 0,
            REG_REV_EXPIRED_TIME            : (+params.REG_REV_EXPIRED_TIME) ? (+params.REG_REV_EXPIRED_TIME)*1000 : Number.MAX_SAFE_INTEGER,
            CANCEL_DELAY_MAKER_MIN          : +params.CANCEL_DELAY_MAKER_MIN,
            CANCEL_DELAY_TAKER_MIN          : +params.CANCEL_DELAY_TAKER_MIN,
            // CANCEL_DELAY_MAKER_MIN          : 3, //params.CANCEL_DELAY_MAKER_MIN,
            // CANCEL_DELAY_TAKER_MIN          : 3, //params.CANCEL_DELAY_TAKER_MIN,
            CLOSE_COMMAND                   : params.CLOSE_COMMAND,
            CLOSE_COMMAND_TIME              : +params.CLOSE_COMMAND_TIME,
            CLOSE_COMMAND_TP_EXCEEDING      : +params.CLOSE_COMMAND_TP_EXCEEDING,
            CLOSE_COMMAND_TQ_LEVEL          : +params.CLOSE_COMMAND_TQ_LEVEL,
            CLOSE_COMMAND_TQ                : +params.CLOSE_COMMAND_TQ,
            CLOSE_TIME_PROLONG_ENABLE       : +params.CLOSE_TIME_PROLONG_ENABLE,
            ORACLE_ZERO                     : params.ORACLE_ZERO
        },
        SWINGS_SL_CANCEL                    : +(process.env.SWINGS_SL_CANCEL || '0')
    };


    if (global.params.p1 === 0) global.params.p1 = Number.MAX_SAFE_INTEGER;
    // global.params.p1 = Number.MAX_SAFE_INTEGER;
    // global.params.env.CLOSE_COMMAND = 'QUANT';
    if (global.params.env.CLOSE_COMMAND === 'INTERNAL' && global.params.env.CLOSE_COMMAND_TIME < global.params.p1)
        global.params.p1 = global.params.env.CLOSE_COMMAND_TIME;

    global.env_total = (await connectors.db_logs.GetGlobalParams());
    let color_ts = (EXEC_MODA === 'MARKET') ? Date.now() : ranges[0][0];
    global.isRed = (await connectors.db_logs.GetLearnDistColor(color_ts));

    if (EXEC_MODA !== 'PNL') {
        await connectors.db_logs.CreateTable(process.env.ORACLE_NAME, process.env.STRAT_ID, 'transactions');
        await connectors.db_logs.CreateTable(process.env.ORACLE_NAME, process.env.STRAT_ID, 'serialization');
        await connectors.db_logs.CreateTable(process.env.ORACLE_NAME, process.env.STRAT_ID, 'logging');

        if (RECALCULATE_HISTORY === 1 && (EXEC_MODA !== 'MARKET')) {
            await connectors.db_logs.DeleteExperiment('transactions');
            await connectors.db_logs.DeleteExperiment('serialization');
            await connectors.db_logs.DeleteExperiment('logging');
            await connectors.db_logs.DeleteExperiment('CHECKPOINT');
        }

        try {
            if (RECALCULATE_HISTORY === 0) await math.market.DeSerialize();
            if (Object.keys(global.market_status.OP).length > 0 || global.queue.length > 0 || global.sequence !== 0){
                let ops = Object.keys(global.market_status.OP).length;
                let ques = global.queue.length;
                if (EXEC_MODA === 'MARKET' && (ops+ques) === 0) global.pause = 1;
                console.log(`Runs from OP.length = ${ops}; Queue.length = ${global.queue.length}; sequence = ${global.sequence}; ques = ${ques}`);
            }
            else {
                console.log('Runs from scretch ------------------');
            }
        }
        catch (err) {
            let message = `ERROR during DeSerialization ${JSON.stringify(err)}`;
            console.error(message, JSON.stringify(err));
            process.exit(1);
        }

        console.log(JSON.stringify(global.params));
        let status = {
            in_progress:    global.in_progress >>> 16,
            queue:          global.queue.length,
            logs:           global.logs.length,
            pre_logs:       global.pre_logs.length,
            sequence:       global.sequence,
            wallet:         global.wallet,
            ready4logs:     global.ignore_logs,
            isRed:          global.isRed
        };
        console.log(`Status: ${JSON.stringify(status)}`);

        if (RECALCULATE_HISTORY === 1) {
            // await sleep(5000);
            await connectors.self.Batch();
        }
        if (INTERNAL_RISK_MANAGER === 0) await connectors.account.Get_Money(Number.MAX_SAFE_INTEGER);
    }
    else {
        await connectors.self.Init();
        while (!global.init_done){
            await sleep(60000);
            console.log('INIT is still running ...........');
        }
        console.log('INIT DONE ========================================');
    }
}