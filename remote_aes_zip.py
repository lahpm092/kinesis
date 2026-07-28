"""Read AES-encrypted zips over HTTP range requests (remotezip IO + pyzipper AES)."""
import pyzipper
from remotezip import RemoteFetcher, RemoteIO


class RemoteAESZip(pyzipper.AESZipFile):
    def __init__(self, url, initial_buffer_size=64 * 1024, session=None,
                 fetcher=RemoteFetcher, support_suffix_range=True, **kwargs):
        f = fetcher(url, session, support_suffix_range=support_suffix_range, **kwargs)
        rio = RemoteIO(f.fetch, initial_buffer_size)
        super().__init__(rio)
        rio.set_position_to_size(self._get_position_to_size())

    def _get_position_to_size(self):
        ilist = sorted(self.infolist(), key=lambda i: i.header_offset)
        if not ilist:
            return {self.start_dir: 1}
        out = {}
        for cur, nxt in zip(ilist, ilist[1:]):
            out[cur.header_offset] = nxt.header_offset - cur.header_offset
        out[ilist[-1].header_offset] = self.start_dir - ilist[-1].header_offset
        return out
