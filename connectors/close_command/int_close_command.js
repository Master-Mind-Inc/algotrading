module.exports.GetCloseCommand = function(pos, last_price, ts){
    let CLOSE_COMMAND_TIME = global.params.env.CLOSE_COMMAND_TIME;
    let _1M_QTY = Math.round(CLOSE_COMMAND_TIME/60);
    let CLOSE_COMMAND_TP_EXCEEDING = global.params.env.CLOSE_COMMAND_TP_EXCEEDING;

    let _5m_number = Math.floor((ts - pos.ts)/300000);
    let _1m_number = Math.floor((ts - pos.ts)/60000);
    let virtual = pos.virtual;

    if (_1m_number > _1M_QTY) return true;

    let _5m_cnt = _5m_number - virtual._5m_number;
    let _1m_cnt = _1m_number - virtual._1m_number;

    if (_1m_cnt !== 0) {
        virtual._1m_number = _1m_number;
        if (_5m_cnt !== 0) {
            let delta_price = pos.type * (last_price - virtual.last_price);
            if (delta_price === 0) {
                virtual.tp_price -= pos.type * _5m_cnt * virtual._5m_price_quantum / 2;
                virtual.sl_price += pos.type * _5m_cnt * virtual._5m_price_quantum / 2;
            }
            // to ---> TP
            if (delta_price > 0){
                let del_del = _5m_cnt * virtual._5m_price_quantum - delta_price;
                if (del_del === 0) {
                    virtual.sl_price += pos.type * _5m_cnt * virtual._5m_price_quantum;
                }
                // Small delta_price
                else if (del_del > 0) {
                    virtual.sl_price += pos.type * delta_price;
                    virtual.tp_price -= pos.type * del_del / 2;
                    virtual.sl_price += pos.type * del_del / 2;
                }
                // Large delta_price
                else {
                    virtual.sl_price += pos.type * delta_price;
                    virtual.tp_price -= pos.type * del_del;
                    if (CLOSE_COMMAND_TP_EXCEEDING === 0) {
                        let del_del_del = pos.type * (virtual.tp_price - pos.tpsl.tp.price);
                        if (del_del_del > 0) {
                            virtual.tp_price -= pos.type * del_del_del;
                            virtual.sl_price -= pos.type * del_del_del;
                        }
                    }
                }
            }
            // to ---> SL, delta_price < 0
            else {
                let del_del = _5m_cnt * virtual._5m_price_quantum + delta_price;
                // Large delta_price
                if (del_del <= 0) {
                    virtual.tp_price -= pos.type * _5m_cnt * virtual._5m_price_quantum;
                }
                // Small delta_price
                else {
                    virtual.tp_price += pos.type * delta_price;
                    virtual.tp_price -= pos.type * del_del / 2;
                    virtual.sl_price += pos.type * del_del / 2;
                }
            }
            virtual._5m_number = _5m_number;
            virtual.last_price = last_price;
            virtual.steps.push({_5m_number, last_price, tp_price: virtual.tp_price, sl_price: virtual.sl_price});
        }
    }
    let cause = (pos.type*last_price >= pos.type*virtual.tp_price) ? 'INTP' : 'INSL';
    let to_close = virtual.to_close || (pos.type*last_price >= pos.type*virtual.tp_price) || (pos.type*last_price <= pos.type*virtual.sl_price);
    if (to_close) pos.cause = cause;
    return to_close;
}
