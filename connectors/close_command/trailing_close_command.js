module.exports.GetCloseCommand = function(pos, last_price, ts){
    let _1m_number = Math.floor((ts - pos.ts)/60000);
    let virtual = pos.virtual;

    let _1m_cnt = _1m_number - virtual._1m_number;
    if (_1m_cnt !== 0) {
        virtual._1m_number = _1m_number;
        let next_sl_price = last_price - pos.type * virtual.sl_delta;
        if (pos.type * next_sl_price > pos.type * virtual.sl_price) {
            virtual.sl_price = next_sl_price;
            virtual.steps.push({idx: _1m_number, last_price, tp_price: virtual.tp_price, sl_price: virtual.sl_price});
        }

    }
    let cause = (pos.type*last_price >= pos.type*virtual.tp_price) ? 'TRTP' : 'TRSL';
    let to_close = virtual.to_close || (pos.type*last_price >= pos.type*virtual.tp_price) || (pos.type*last_price <= pos.type*virtual.sl_price);
    if (to_close) pos.cause = cause;
    return to_close;
}


