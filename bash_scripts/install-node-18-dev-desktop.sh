set -e
echo "Switching to home directory..."
cd ~

echo "Current path: ${PWD}"

echo "Uninstalling/Installing required dependencies..."
sudo yum erase -y openssl-devel
sudo yum install -y curl expat-devel bzip2-devel libffi-devel make \
  ncurses-devel openssl11-devel readline-devel sqlite-devel wget \
  xz-devel zlib-devel

# install asdf
echo "Installing asdf..."
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.11.3
chmod +x ~/.asdf/asdf.sh ~/.asdf/completions/asdf.bash

# Add asdf to the path
source ~/.asdf/asdf.sh

# install python 3.8.16
echo "Installing python for asdf..."
asdf plugin add python
asdf install python 3.8.16
asdf global python 3.8.16

# Plugin time
echo "Installing node for asdf..."
asdf plugin add nodejs
asdf install nodejs 18.16.0
asdf global nodejs 18.16.0

# install node lts (18)
echo "Installing Node 18. This takes a long time...🍿"
sudo yum install -y gcc10-c++ ninja-build

ASDF_NODEJS_VERBOSE_INSTALL=1 \
    ASDF_NODEJS_FORCE_COMPILE=1 \
    CXX=gcc10-g++ \
    NINJA=ninja-build CONFIGURE_OPTS=--ninja \
    asdf install nodejs 18.16.0
# ^ takes a REALLY long time...🍿
