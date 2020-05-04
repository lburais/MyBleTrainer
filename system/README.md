## System File Helpers

To get access working nicely on linux you will need to create an appropriate udev rules file for the portal to be able to be accessed by general users. To do this, copy the `999-yourdevice.rules` file to the `/etc/udev/rules.d/` folderon your machine.

If you have cloned this repo, then you should be able to run the following commands to have the device accessible from normal users.  For example, to give all users permissions to interface with an occulus rift you would perform the following:

```
sudo cp system/999-rift.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
```