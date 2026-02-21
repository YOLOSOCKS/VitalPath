import os
from cryptography.hazmat.primitives import serialization
import snowflake.connector

class SnowflakeClient:
    def __init__(self):
        self.user = os.getenv("SNOWFLAKE_USER")
        self.account = os.getenv("SNOWFLAKE_ACCOUNT")
        self.warehouse = os.getenv("SNOWFLAKE_WAREHOUSE")
        self.database = os.getenv("SNOWFLAKE_DATABASE")
        self.schema = os.getenv("SNOWFLAKE_SCHEMA")
        self.private_key_path = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
        self._load_private_key()
        self._connect()

    def _load_private_key(self):
        if not self.private_key_path:
            raise ValueError("SNOWFLAKE_PRIVATE_KEY_PATH environment variable is not set.")
        with open(self.private_key_path, "rb") as key_file:
            p_key = serialization.load_pem_private_key(
                key_file.read(),
                password=None,
            )
        self.private_key_bytes = p_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )

    def _connect(self):
        self.conn = snowflake.connector.connect(
            user=self.user,
            account=self.account,
            warehouse=self.warehouse,
            database=self.database,
            schema=self.schema,
            private_key=self.private_key_bytes,
        )

    def run_query(self, sql):
        cur = self.conn.cursor()
        try:
            cur.execute(sql)
            result = cur.fetchall()
        finally:
            cur.close()
        return result

    def close(self):
        self.conn.close()
