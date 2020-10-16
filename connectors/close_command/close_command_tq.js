module.exports.GetCloseCommand = function(pos, last_price, TQ_del){
    let CLOSE_COMMAND_TQ = global.params.env.CLOSE_COMMAND_TQ;
    let CLOSE_COMMAND_TQ_LEVEL = global.params.env.CLOSE_COMMAND_TQ_LEVEL;
    
    let virtual = pos.virtual;

    let psy_level = (pos.type * last_price > pos.type * virtual.psy_levels[6]) ? 7 :
        (pos.type * last_price > pos.type * virtual.psy_levels[5]) ? 6 :
        (pos.type * last_price > pos.type * virtual.psy_levels[4]) ? 5 :
        (pos.type * last_price > pos.type * virtual.psy_levels[3]) ? 4 :
        (pos.type * last_price > pos.type * virtual.psy_levels[2]) ? 3 :
        (pos.type * last_price > pos.type * virtual.psy_levels[1]) ? 2 :
        (pos.type * last_price > pos.type * virtual.psy_levels[5]) ? 1 : 0;
    let to_close = virtual.to_close || (CLOSE_COMMAND_TQ === 1 && psy_level !== virtual.last_psy_level && pos.type * TQ_del < pos.type * CLOSE_COMMAND_TQ_LEVEL);
    if (to_close) pos.cause = `TQ${psy_level}`;
    return to_close;
}

