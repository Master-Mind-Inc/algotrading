module.exports.GetCloseCommand = function(pos, last_price, ts){
    let _1m_number = Math.floor((ts - pos.ts)/60000);
    let virtual = pos.virtual;

    let _1m_cnt = _1m_number - virtual._1m_number;
    if (_1m_cnt !== 0) {
        virtual._1m_number = _1m_number;
        if (virtual.quant_number < 6 && pos.type * last_price >= pos.type * virtual.psy_levels[6]) {
            virtual.quant_number = 6;
            virtual.sl_price = virtual.psy_levels[4];
            virtual.steps.push({idx: _1m_number, last_price, tp_price: virtual.tp_price, sl_price: virtual.sl_price});
        }
        else if (virtual.quant_number < 4 && pos.type * last_price >= pos.type * virtual.psy_levels[4]) {
            virtual.quant_number = 4;
            virtual.sl_price = virtual.psy_levels[3];
            virtual.steps.push({idx: _1m_number, last_price, tp_price: virtual.tp_price, sl_price: virtual.sl_price});
        }
    }
    let to_close = virtual.to_close || (pos.type*last_price <= pos.type*virtual.sl_price);
    if (to_close) pos.cause = `QNT${virtual.quant_number}`;
    return to_close;
}

