// Fetch a fresh session for every write so an open window survives service restarts.
// Do not retry writes: a lost response does not mean the action failed.
export function createApiClient(fetchImpl = fetch) {
  return async function post(path, input) {
    const session = await fetchImpl('/api/session', {cache: 'no-store'});
    if (!session.ok) throw new Error('The local service could not open a session.');
    const {csrf} = await session.json();
    if (typeof csrf !== 'string' || !/^[a-f0-9]{64}$/.test(csrf)) {
      throw new Error('The local service returned an invalid session.');
    }
    const response = await fetchImpl(path, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'x-hyperaccts-token': csrf},
      body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok || data?.ok === false) {
      throw new Error(typeof data?.message === 'string' ? data.message : 'The request failed.');
    }
    return data;
  };
}
