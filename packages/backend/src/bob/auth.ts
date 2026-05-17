import axios from "axios";

interface IamTokenResponse {
  access_token: string;
}

export async function getIAMToken(apiKey: string): Promise<string> {
  const response = await axios.post<IamTokenResponse>(
    "https://iam.cloud.ibm.com/identity/token",
    new URLSearchParams({
      grant_type: "urn:ibm:params:oauth:grant-type:apikey",
      apikey: apiKey,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );

  return response.data.access_token;
}
