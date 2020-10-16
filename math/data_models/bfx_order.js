function Order_Status_Detail(order_status){
    /*
    EXECUTED @ 9169.7(0.00426667): was PARTIALLY FILLED @ 9169.7(0.00085885)
    EXECUTED @ 9332.5(-0.00296811): was PARTIALLY FILLED @ 9333.0(-0.00403189), PARTIALLY FILLED @ 9333.0(-0.001), PARTIALLY FILLED @ 9332.5(-0.011), PARTIALLY FILLED @ 9332.5(-0.011)
    */
    return order_status.split(',').reduce((a,c) => {
        let cc = c.split(':');
        if (cc.length > 1 && cc[1].indexOf('@') !== -1) a.push(... cc);
        else a.push(cc[0]);
        return a;
    }, []).map(c => {
        let m = c.trim().split('@');
        return {
            status: m[0].trim(),
            price:  (m.length > 1) ? +(m[1].split('(')[0].trim()) : null,
            coin:   (m.length > 1) ? Math.round(Math.abs(+(m[1].split('(')[1].replace(")", '').trim())*global.env_total.BASE_SATOSHI)) : null
        };
    });
}

module.exports.submitted = function(submitted_order){
    // string	Order Status:
    // ACTIVE, EXECUTED @ PRICE(AMOUNT) e.g. "EXECUTED @ 107.6(-0.2)",
    // PARTIALLY FILLED @ PRICE(AMOUNT), INSUFFICIENT MARGIN was: PARTIALLY FILLED @ PRICE(AMOUNT),
    // CANCELED, CANCELED was: PARTIALLY FILLED @ PRICE(AMOUNT), RSN_DUST (amount is less than 0.00000001),
    // RSN_PAUSE (trading is paused / paused due to AMPL rebase event)

    let order = {
        id:             submitted_order[4][0][0],                   // int	Order ID
        cid:            submitted_order[4][0][2],                   // int	Client Order ID
        ts:             submitted_order[4][0][4],                   // int	Second timestamp of creation
        coin:           Math.round(Math.abs(submitted_order[4][0][7])*global.env_total.BASE_SATOSHI),         // float. Original amount in satoshi
        price:          submitted_order[4][0][16],                  // float	Price
        message: {
            status:     submitted_order[6],                         // string	Status of the notification; it may vary over time (SUCCESS, ERROR, FAILURE, ...)
            text:       submitted_order[7],                         // string	Text of the notification
        },
        order_status:   Order_Status_Detail(submitted_order[4][0][13])
    }
    return order;
}

module.exports.cancelled = function(cancelled_order){
    // string	Order Status:
    // ACTIVE, EXECUTED @ PRICE(AMOUNT) e.g. "EXECUTED @ 107.6(-0.2)",
    // PARTIALLY FILLED @ PRICE(AMOUNT), INSUFFICIENT MARGIN was: PARTIALLY FILLED @ PRICE(AMOUNT),
    // CANCELED, CANCELED was: PARTIALLY FILLED @ PRICE(AMOUNT), RSN_DUST (amount is less than 0.00000001),
    // RSN_PAUSE (trading is paused / paused due to AMPL rebase event)
    let order = {
        id:             cancelled_order[4][0],                   // int	Order ID
        cid:            cancelled_order[4][2],                   // int	Client Order ID
        ts:             cancelled_order[4][4],                   // int	Second timestamp of creation
        coin:           Math.round(Math.abs(cancelled_order[4][7])*global.env_total.BASE_SATOSHI),         // float. Original amount in satoshi
        price:          cancelled_order[4][16],                  // float	Price
        message: {
            status:     cancelled_order[6],                         // string	Status of the notification; it may vary over time (SUCCESS, ERROR, FAILURE, ...)
            text:       cancelled_order[7],                         // string	Text of the notification
        },
        order_status:   Order_Status_Detail(cancelled_order[4][13])
    }
    return order;
} 

module.exports.opened = function(opened_order){
    let orders = opened_order.map(c => {
        // string	Order Status:
        // ACTIVE, EXECUTED @ PRICE(AMOUNT) e.g. "EXECUTED @ 107.6(-0.2)",
        // PARTIALLY FILLED @ PRICE(AMOUNT), INSUFFICIENT MARGIN was: PARTIALLY FILLED @ PRICE(AMOUNT),
        // CANCELED, CANCELED was: PARTIALLY FILLED @ PRICE(AMOUNT), RSN_DUST 0(amount is less than 0.00000001),
        // RSN_PAUSE (trading is paused / paused due to AMPL rebase event)
        return {
            id:             c[0],                   // int64       Order ID
            cid:            c[2],                   // int         Client Order ID
            ts:             c[4],                   // int         Millisecond timestamp of creation
            coin:           Math.round(Math.abs(c[7])*global.env_total.BASE_SATOSHI),         // float. Original amount in satoshi
            price:          c[15],                  // float       Price
            message: {
                status:     'SUCCESS',
                text:       ''
            },
            order_status:   Order_Status_Detail(c[13])
        };
    });
    return orders;
} 

module.exports.historical = function(hist_orders){
    let orders = hist_orders.map(c => {
        // string	Order Status:
        // ACTIVE, EXECUTED @ PRICE(AMOUNT) e.g. "EXECUTED @ 107.6(-0.2)",
        // PARTIALLY FILLED @ PRICE(AMOUNT), INSUFFICIENT MARGIN was: PARTIALLY FILLED @ PRICE(AMOUNT),
        // CANCELED, CANCELED was: PARTIALLY FILLED @ PRICE(AMOUNT), RSN_DUST (amount is less than 0.00000001),
        // RSN_PAUSE (trading is paused / paused due to AMPL rebase event)
        return {
            id:             c[0],                   // int64       Order ID
            cid:            c[2],                   // int         Client Order ID
            ts:             c[4],                   // int         Millisecond timestamp of creation
            coin:           Math.round(Math.abs(c[7])*global.env_total.BASE_SATOSHI),         // float. Original amount in satoshi
            price:          c[16],                  // float       Price
            message: {
                status:     'SUCCESS',
                text:       ''
            },
            order_status:   Order_Status_Detail(c[13])
        };
    });
    return orders;
}

module.exports.submitted_ex = function(submitted_order){
    let order = {
        MTS:            submitted_order[0], // int	Millisecond Time Stamp of the update
        _TYPE:          submitted_order[1], // string	Purpose of notification ('on-req', 'oc-req', 'uca', 'fon-req', 'foc-req')
        MESSAGE_ID:     submitted_order[2], // int	unique ID of the message
        // _PLACEHOLDER:   submitted_order[3], // placeholred
        ID:             submitted_order[4][0][0], // int	Order ID
        GID:            submitted_order[4][0][1], // int	Group ID
        CID:            submitted_order[4][0][2], // int	Client Order ID
        SYMBOL:         submitted_order[4][0][3], // string	Pair (tBTCUSD, …)
        MTS_CREATE:     submitted_order[4][0][4], // int	Millisecond timestamp of creation
        MTS_UPDATE:     submitted_order[4][0][5], // int	Millisecond timestamp of update
        AMOUNT:         submitted_order[4][0][6], // float	Positive means buy, negative means sell.
        AMOUNT_ORIG:    submitted_order[4][0][7], // float	Original amount
        TYPE:           submitted_order[4][0][8], // string	The type of the order: LIMIT, MARKET, STOP, TRAILING STOP, EXCHANGE MARKET, EXCHANGE LIMIT, EXCHANGE STOP, EXCHANGE TRAILING STOP, FOK, EXCHANGE FOK, IOC, EXCHANGE IOC.
        TYPE_PREV:      submitted_order[4][0][9], // string	Previous order type
        MTS_TIF:        submitted_order[4][0][10], // int	Millisecond timestamp of Time-In-Force: automatic order cancellation
        // _PLACEHOLDER:   submitted_order[4][0][11], // placeholred
        FLAGS:          submitted_order[4][0][12], // int	See https://docs.bitfinex.com/v2/docs/flag-values.
        ORDER_STATUS:   submitted_order[4][0][13], // string	Order Status: ACTIVE, EXECUTED @ PRICE(AMOUNT) e.g. "EXECUTED @ 107.6(-0.2)", PARTIALLY FILLED @ PRICE(AMOUNT), INSUFFICIENT MARGIN was: PARTIALLY FILLED @ PRICE(AMOUNT), CANCELED, CANCELED was: PARTIALLY FILLED @ PRICE(AMOUNT), RSN_DUST (amount is less than 0.00000001), RSN_PAUSE (trading is paused / paused due to AMPL rebase event)
        // _PLACEHOLDER:   submitted_order[4][0][14], // placeholred
        // _PLACEHOLDER:   submitted_order[4][0][15], // placeholred
        PRICE:          submitted_order[4][0][16], // float	Price
        PRICE_AVG:      submitted_order[4][0][17], // float	Average price
        PRICE_TRAILING: submitted_order[4][0][18], // float	The trailing price
        PRICE_AUX_LIMIT:submitted_order[4][0][19], // float	Auxiliary Limit price (for STOP LIMIT)
        // _PLACEHOLDER:   submitted_order[4][0][20], // placeholred
        // _PLACEHOLDER:   submitted_order[4][0][21], // placeholred
        // _PLACEHOLDER:   submitted_order[4][0][22], // placeholred
        // _PLACEHOLDER:   submitted_order[4][0][23], // placeholred
        HIDDEN:         submitted_order[4][0][24], // int	0 if false, 1 if true
        PLACED_ID:      submitted_order[4][0][25], // int	If another order caused this order to be placed (OCO) this will be that other order's ID
        // _PLACEHOLDER:   submitted_order[4][0][26], // placeholred
        // _PLACEHOLDER:   submitted_order[4][0][27], // placeholred
        ROUTING:        submitted_order[4][0][28], // string	indicates origin of action: BFX, ETHFX, API>BFX, API>ETHFX
        // _PLACEHOLDER:   submitted_order[4][0][29], // placeholred
        // _PLACEHOLDER:   submitted_order[4][0][30], // placeholred
        META:           submitted_order[4][0][31], // json string	Additional meta information about the order ( $F7 = IS_POST_ONLY, $F33 = LEV)
        IDs:            submitted_order[4][1], // int	Order ID
        CODE:           submitted_order[5], // null or integer	Work in progress
        STATUS:         submitted_order[6], // string	Status of the notification; it may vary over time (SUCCESS, ERROR, FAILURE, ...)
        TEXT:           submitted_order[7] // string	Text of the notification
    }
    return order;
}

module.exports.cancelled_ex = function(cancelled_order){
    let order = {
        MTS:            cancelled_order[0], // int	Millisecond Time Stamp of the update
        _TYPE:          cancelled_order[1], // string	Purpose of notification ('on-req', 'oc-req', 'uca', 'fon-req', 'foc-req')
        MESSAGE_ID:     cancelled_order[2], // int	unique ID of the message
        // _PLACEHOLDER:   cancelled_order[3], // placeholred
        ID:             cancelled_order[4][0], // int	Order ID
        GID:            cancelled_order[4][1], // int	Group ID
        CID:            cancelled_order[4][2], // int	Client Order ID
        SYMBOL:         cancelled_order[4][3], // string	Pair (tBTCUSD, …)
        MTS_CREATE:     cancelled_order[4][4], // int	Millisecond timestamp of creation
        MTS_UPDATE:     cancelled_order[4][5], // int	Millisecond timestamp of update
        AMOUNT:         cancelled_order[4][6], // float	Positive means buy, negative means sell.
        AMOUNT_ORIG:    cancelled_order[4][7], // float	Original amount
        TYPE:           cancelled_order[4][8], // string	The type of the order: LIMIT, MARKET, STOP, TRAILING STOP, EXCHANGE MARKET, EXCHANGE LIMIT, EXCHANGE STOP, EXCHANGE TRAILING STOP, FOK, EXCHANGE FOK, IOC, EXCHANGE IOC.
        TYPE_PREV:      cancelled_order[4][9], // string	Previous order type
        MTS_TIF:        cancelled_order[4][10], // int	Millisecond timestamp of Time-In-Force: automatic order cancellation
        // _PLACEHOLDER:   cancelled_order[4][11], // placeholred
        FLAGS:          cancelled_order[4][12], // int	See https://docs.bitfinex.com/v2/docs/flag-values.
        ORDER_STATUS:   cancelled_order[4][13], // string	Order Status: ACTIVE, EXECUTED @ PRICE(AMOUNT) e.g. "EXECUTED @ 107.6(-0.2)", PARTIALLY FILLED @ PRICE(AMOUNT), INSUFFICIENT MARGIN was: PARTIALLY FILLED @ PRICE(AMOUNT), CANCELED, CANCELED was: PARTIALLY FILLED @ PRICE(AMOUNT), RSN_DUST (amount is less than 0.00000001), RSN_PAUSE (trading is paused / paused due to AMPL rebase event)
        // _PLACEHOLDER:   cancelled_order[4][14], // placeholred
        // _PLACEHOLDER:   cancelled_order[4][15], // placeholred
        PRICE:          cancelled_order[4][16], // float	Price
        PRICE_AVG:      cancelled_order[4][17], // float	Average price
        PRICE_TRAILING: cancelled_order[4][18], // float	The trailing price
        PRICE_AUX_LIMIT:cancelled_order[4][19], // float	Auxiliary Limit price (for STOP LIMIT)
        // _PLACEHOLDER:   cancelled_order[4][20], // placeholred
        // _PLACEHOLDER:   cancelled_order[4][21], // placeholred
        // _PLACEHOLDER:   cancelled_order[4][22], // placeholred
        // _PLACEHOLDER:   cancelled_order[4][23], // placeholred
        HIDDEN:         cancelled_order[4][24], // int	0 if false, 1 if true
        PLACED_ID:      cancelled_order[4][25], // int	If another order caused this order to be placed (OCO) this will be that other order's ID
        // _PLACEHOLDER:   cancelled_order[4][26], // placeholred
        // _PLACEHOLDER:   cancelled_order[4][27], // placeholred
        ROUTING:        cancelled_order[4][28], // string	indicates origin of action: BFX, ETHFX, API>BFX, API>ETHFX
        // _PLACEHOLDER:   cancelled_order[4][29], // placeholred
        // _PLACEHOLDER:   cancelled_order[4][30], // placeholred
        META:           cancelled_order[4][31], // json string	Additional meta information about the order ( $F7 = IS_POST_ONLY, $F33 = LEV)
        CODE:           cancelled_order[5], // null or integer	Work in progress
        STATUS:         cancelled_order[6], // string	Status of the notification; it may vary over time (SUCCESS, ERROR, FAILURE, ...)
        TEXT:           cancelled_order[7] // string	Text of the notification
    }
    return order;
}

module.exports.opened_ex = function(opened_orders){
    let orders = opened_orders.map(c => {
        return {
        ID:             c[0],   // int64       Order ID
        GID:            c[1],   // int         Group ID
        CID:            c[2],   // int         Client Order ID
        SYMBOL:         c[3],   // string      Pair (tBTCUSD, …)
        MTS_CREATE:     c[4],   // int         Millisecond timestamp of creation
        MTS_UPDATE:     c[5],   // int         Millisecond timestamp of update
        AMOUNT:         c[6],   // float       Positive means buy, negative means sell.
        AMOUNT_ORIG:    c[7],   // float       Original amount
        TYPE:           c[8],   // string      The type of the order: LIMIT, MARKET, STOP, TRAILING STOP, EXCHANGE MARKET, EXCHANGE LIMIT, EXCHANGE STOP, EXCHANGE TRAILING STOP, FOK, EXCHANGE FOK, IOC, EXCHANGE IOC.
        TYPE_PREV:      c[9],   // string      Previous order type
        // _PLACEHOLDER:   c[10],
        // _PLACEHOLDER:   c[11],
        FLAGS:          c[12],  // int         Upcoming Params Object (stay tuned)
        ORDER_STATUS:   c[13],  // string      Order Status: ACTIVE, EXECUTED, PARTIALLY FILLED, CANCELED, RSN_DUST (amount is less than 0.00000001), RSN_PAUSE (trading is paused / paused due to AMPL rebase event)
        // _PLACEHOLDER:   c[14],
        // _PLACEHOLDER:   c[15],
        PRICE:          c[16],  // float       Price
        PRICE_AVG:      c[17],  // float       Average price
        PRICE_TRAILING: c[18],  // float       The trailing price
        PRICE_AUX_LIMIT:c[19],  // float       Auxiliary Limit price (for STOP LIMIT)
        // _PLACEHOLDER:   c[20],
        // _PLACEHOLDER:   c[21],
        // _PLACEHOLDER:   c[22],
        HIDDEN:         c[23],  // int         1 if Hidden, 0 if not hidden
        PLACED_ID:      c[24]   // int         If another order caused this order to be placed (OCO) this will be that other order's ID
    };});
    return orders;
}

module.exports.historical_ex = function(hist_orders){
    let orders = hist_orders.map(c => { return {
        ID:             c[0],   // int	Order ID
        GID:            c[1],   // int	Group ID
        CID:            c[2],   // int	Client Order ID
        SYMBOL:         c[3],   // string	Pair (tBTCUSD, …)
        MTS_CREATE:     c[4],   // int	Millisecond timestamp of creation
        MTS_UPDATE:     c[5],   // int	Millisecond timestamp of update
        AMOUNT:         c[6],   // float	Positive means buy, negative means sell.
        AMOUNT_ORIG:    c[7],   // float	Original amount
        TYPE:           c[8],   // string	The type of the order:
                                //              LIMIT, MARKET, STOP, TRAILING STOP,
                                //              EXCHANGE MARKET, EXCHANGE LIMIT, EXCHANGE STOP, EXCHANGE TRAILING STOP, EXCHANGE FOK, IOC, EXCHANGE IOC
                                //              FOK.
        TYPE_PREV:      c[9],   // string	Previous order type
        MTS_TIF:        c[10],  // int	Millisecond timestamp of Time-In-Force: automatic order cancellation
        // _PLACEHOLDER:   c[11],  // null
        FLAGS:          c[12],  // int	See https://docs.bitfinex.com/v2/docs/flag-values.
        ORDER_STATUS:   c[13],  // string	Order Status: ACTIVE, EXECUTED @ PRICE(AMOUNT) e.g. "EXECUTED @ 107.6(-0.2)", PARTIALLY FILLED @ PRICE(AMOUNT), INSUFFICIENT MARGIN was: PARTIALLY FILLED @ PRICE(AMOUNT), CANCELED, CANCELED was: PARTIALLY FILLED @ PRICE(AMOUNT), RSN_DUST (amount is less than 0.00000001), RSN_PAUSE (trading is paused / paused due to AMPL rebase event)
        // _PLACEHOLDER:   c[14],  // null
        // _PLACEHOLDER:   c[15],  // null
        PRICE:          c[16],  // float	Price
        PRICE_AVG:      c[17],  // float	Average price
        PRICE_TRAILING: c[18],  // float	The trailing price
        PRICE_AUX_LIMIT:c[19],  // float	Auxiliary Limit price (for STOP LIMIT)
        // _PLACEHOLDER:   c[20],  // null
        // _PLACEHOLDER:   c[21],  // null
        // _PLACEHOLDER:   c[22],  // null
        // _PLACEHOLDER:   c[23],  // null
        HIDDEN:         c[24],  // int	0 if false, 1 if true
        PLACED_ID:      c[25],  // int	If another order caused this order to be placed (OCO) this will be that other order's ID
        // _PLACEHOLDER:   c[26],  // null
        // _PLACEHOLDER:   c[27],  // null
        ROUTING:        c[28],  // string	indicates origin of action: BFX, ETHFX, API>BFX, API>ETHFX
        // _PLACEHOLDER:   c[29],  // null
        // _PLACEHOLDER:   c[30],  // null
        META:           c[31]   // json/string	Additional meta information about the order ( $F7 = IS_POST_ONLY, $F33 = LEV)
        // CODE:           c[32],  // null/integer	Work in progress
        // STATUS:         c[33],  // string	Status of the notification; it may vary over time (SUCCESS, ERROR, FAILURE, ...)
        // TEXT:           c[34]   // string	Text of the notification
    };});
    return orders;
}