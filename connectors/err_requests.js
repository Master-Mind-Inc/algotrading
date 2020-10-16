const request = require('request-promise');

module.exports.Log_Error = async function (err, account, oracle, strategy){
    let url = `http://${process.env.ERR_URL}`;
    if (process.env.ERR_URL === '') return '{success: true, result: {}};';
    else return await get_data(url, 'POST', {err, account, oracle, strategy});
}

async function get_data(url, method, body) {
    let res = {success: false, error: "", result: {}};
    const options = {
        method: method,
        url: url,
        body: body,
        json: true
    };
    await request(options).then(body => {
        res.success = true;
        res.result = body;
    })
    .catch(err => {
        res.error = err.message;
        console.log(`Error in ${method} ${url}: ${err.message}`);
    });
    return res;
}