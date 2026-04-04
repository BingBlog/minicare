import uuid
import time
import jwt

def generate_client_secret_jwt():
    token_endpoint = "https://ssosv.sankuai.com/sson/auth/oidc/v1/token"

    client_id = '2a7394863a'
    secret = '5b9a654365a5436ab655ac6541ec1ef5'

    payload = {
        'sub': client_id,
        'iss': client_id,
        'aud': [token_endpoint],
        'exp': int(time.time()) + 86400,
        'iat': int(time.time()),
        'jti': str(uuid.uuid4())
    }

    generated_jwt = jwt.encode(payload, secret, algorithm='HS256', headers={'typ': 'JWT'})
    return generated_jwt

if __name__ == "__main__":
    token = generate_client_secret_jwt()
    print(token)
