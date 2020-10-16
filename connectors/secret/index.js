const crypto = require('crypto');
const fs = require('fs');

function Decrypt (query) {
    var privateKey = fs.readFileSync(process.cwd()+'/connectors/secret/mmi_rsa', "utf8");
    var decrypted = null;
    if (query) {
        try {
            decrypted = crypto.privateDecrypt(privateKey, Buffer.from(query, "base64"));
        }
        catch (err) {
            let e = fit_error(err);
            console.log(`Decrypt ERROR: ${JSON.stringify(e)}`);
        }
    }
    return (!decrypted) ? 'ABRA-CADABRA' : decrypted.toString("utf8");
};
function CreateHmac(query, API_SEC) {
    return crypto.createHmac('sha256', API_SEC).update(query).digest('hex');
}

function fit_error(err){
    let e = {
        name: err.name,
        statusCode: err.statusCode,
        message: err.message,
        error: err.error,
        options: {
            method: err.options.method,
            url: err.options.url,
            body: err.options.body
        }
    };
    return e;
}

module.exports = {Decrypt, CreateHmac};